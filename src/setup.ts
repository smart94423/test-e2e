export { partRegex } from '@brillout/part-regex'
export { autoRetry } from './autoRetry'
export { fetchHtml }
export { fetch }
export { expectError } from './Logs'
export { run }
export { skip }
export { isMinNodeVersion }
export { isCI }
export { isLinux }
export { isWindows }
export { isMac }
export { sleep }
export { getServerUrl }
export { runCommandThatTerminates } from './runCommandThatTerminates'

import type { ConsoleMessage } from 'playwright-chromium'
import { sleep, logProgress, cliConfig, isWindows, isLinux, isCI, isMac, runCommandLongRunning } from './utils'
import fetch_ from 'node-fetch'
import { assert } from './utils'
import { Logs } from './Logs'
import { editFileAssertReverted, editFileRevert } from './editFile'
import { getCurrentTest, getCwd, setRunInfo } from './getCurrentTest'
import { page } from './page'
import { TIMEOUT_NPM_SCRIPT, TIMEOUT_PLAYWRIGHT, TIMEOUT_PROCESS_TERMINATION } from './TIMEOUTS'

function skip(reason: string) {
  const testInfo = getCurrentTest()
  testInfo.skipped = { reason }
}

function run(
  cmd: string,
  {
    //baseUrl = '',
    additionalTimeout = 0,
    serverIsReadyMessage,
    serverIsReadyDelay = 1000,
    inspect = cliConfig.inspect,
    cwd,
    doNotFailOnWarning,
    serverUrl,
    isFlaky,
  }: {
    //baseUrl?: string
    additionalTimeout?: number
    serverIsReadyMessage?: string | ((log: string) => boolean)
    serverIsReadyDelay?: number
    inspect?: boolean
    /** deprecated */
    cwd?: string
    doNotFailOnWarning?: boolean
    serverUrl?: string
    isFlaky?: boolean
  } = {}
) {
  assert(cwd === undefined)

  additionalTimeout += serverIsReadyDelay

  setRunInfo({
    cmd,
    serverUrl,
    additionalTimeout,
    doNotFailOnWarning,
    isFlaky,
  })

  if (inspect) {
    Logs.logEagerly = true
  }

  const testInfo = getCurrentTest()
  let runProcess: RunProcess | null = null
  testInfo.startServer = async () => {
    runProcess = await startProcess({
      cmd,
      additionalTimeout,
      serverIsReadyMessage,
      serverIsReadyDelay,
    })

    page.on('console', onConsole)
    page.on('pageerror', onPageError)

    // This setting will change the default maximum time for all the methods accepting timeout option.
    // https://playwright.dev/docs/api/class-page#page-set-default-timeout
    page.setDefaultTimeout(TIMEOUT_PLAYWRIGHT + additionalTimeout)

    /*
    await bailOnTimeout(
      async () => {
        await page.goto(getServerUrl() + baseUrl)
      },
      { timeout: TIMEOUT_PAGE_LOAD + additionalTimeout },
    )
    */
  }
  testInfo.afterEach = (hasFailed: boolean) => {
    if (!hasFailed) {
      editFileAssertReverted()
    } else {
      editFileRevert()
    }
  }
  testInfo.terminateServer = async () => {
    Logs.add({
      logSource: 'run()',
      logText: 'Terminate server.',
    })
    page.off('console', onConsole)
    page.off('pageerror', onPageError)

    // runProcess is undefined if startProcess() failed
    if (runProcess) {
      await runProcess.terminate()
    }
  }

  return

  // Also called when the page throws an error or a warning
  function onConsole(msg: ConsoleMessage) {
    const type = msg.type()
    Logs.add({
      logSource: (() => {
        if (type === 'error') {
          return 'Browser Error'
        }
        if (type === 'warning') {
          return 'Browser Warning'
        }
        return 'Browser Log'
      })(),
      logText: JSON.stringify(
        {
          type,
          text: msg.text(),
          location: msg.location(),
          args: msg.args(),
        },
        null,
        2
      ),
    })
  }
  // For uncaught exceptions
  function onPageError(err: Error) {
    Logs.add({
      logSource: 'Browser Error',
      logText: JSON.stringify(
        {
          text: err.message,
          location: err.stack,
        },
        null,
        2
      ),
    })
  }
}

type RunProcess = {
  terminate: (force?: true) => Promise<void>
}
async function startProcess({
  serverIsReadyMessage,
  serverIsReadyDelay,
  additionalTimeout,
  cmd,
}: {
  serverIsReadyMessage?: string | ((log: string) => boolean)
  serverIsReadyDelay: number
  additionalTimeout: number
  cmd: string
}): Promise<RunProcess> {
  const cwd = getCwd()

  if (!serverIsReadyMessage) {
    serverIsReadyMessage = (log: string) => {
      const serverIsReady =
        // Express.js server
        log.includes('Server running at') ||
        // npm package `serve`
        log.includes('Accepting connections at') ||
        // Vite
        (log.includes('Local:') && log.includes('http://localhost:3000/'))
      return serverIsReady
    }
  }

  Logs.add({
    logSource: 'run()',
    logText: `Spawn command \`${cmd}\``,
  })

  const done = logProgress(`[run] ${cmd}`)

  const { terminate, isReadyPromise } = runCommandLongRunning({
    cmd,
    cwd,
    isReadyLog: serverIsReadyMessage,
    isReadyTimeout: TIMEOUT_NPM_SCRIPT + additionalTimeout,
    killPort: process.env.CI || !isLinux() ? false : getServerPort(),
    onStderr(data: string, { loggedAfterExit }) {
      Logs.add({
        logSource: 'stderr',
        logText: data,
        loggedAfterExit,
      })
    },
    onStdout(data: string, { loggedAfterExit }) {
      Logs.add({
        logSource: 'stdout',
        logText: data,
        loggedAfterExit,
      })
    },
    onExit(errMsg) {
      if (!errMsg) {
        Logs.add({
          logSource: 'run()',
          logText: `Process termination (expected)`,
        })
      } else {
        Logs.add({
          logSource: 'run() failure',
          logText: errMsg,
        })
      }
    },
    onTerminationError(errMsg) {
      Logs.add({
        logSource: 'run() failure',
        logText: errMsg,
      })
    },
    terminationTimeout: TIMEOUT_PROCESS_TERMINATION,
  })

  let err: unknown
  try {
    await isReadyPromise
  } catch (err_) {
    err = err_
    assert(err)
  }
  done(!!err)
  if (err) throw err
  Logs.add({
    logSource: 'run()',
    logText: 'Server is ready.',
  })

  await sleep(serverIsReadyDelay)

  return { terminate }
}

async function fetchHtml(pathname: string) {
  const response = await fetch(getServerUrl() + pathname)
  const html = await response.text()
  return html
}
async function fetch(...args: Parameters<typeof fetch_>) {
  try {
    return await fetch_(...args)
  } catch (err) {
    Logs.add({
      logSource: 'Connection Error',
      logText: `Couldn't connect to \`${args[0]}\`. Args: \`${JSON.stringify(args.slice(1))}\`. Err: \`${
        // @ts-ignore
        err.message
      }\``,
    })
    throw new Error("Couldn't connect to server. See `Connection Error` log for more details.")
  }
}

/*
async function bailOnTimeout(asyncFunc: () => Promise<void>, { timeout }: { timeout: number }) {
  let resolve: () => void
  let reject: (err: Error) => void
  const promise = new Promise<void>((_resolve, _reject) => {
    resolve = _resolve
    reject = _reject
  })

  const t = setTimeout(() => {
    reject(new Error(`Function timeout.`))
  }, timeout)
  await asyncFunc()
  clearTimeout(t)
  resolve()

  return promise
}
*/

function isMinNodeVersion(minNodeVersion: 14) {
  const { version } = process
  assert(version.startsWith('v'))
  const major = parseInt(version[1] + version[2], 10)
  assert(12 <= major && major <= 50)
  return major >= minNodeVersion
}

function getServerUrl(): string {
  const testInfo = getCurrentTest()
  const serverUrl = testInfo.runInfo?.serverUrl!
  return serverUrl
}

function getServerPort(): number {
  const serverUrl = getServerUrl()
  const portStr = serverUrl.split(':').slice(-1)[0]!.split('/')[0]
  assert(/\d+/.test(portStr), { serverUrl })
  const port = parseInt(portStr, 10)
  return port
}
