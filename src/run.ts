export { run }

import type { ConsoleMessage } from 'playwright-chromium'
import { sleep, logProgress, cliConfig, isLinux, runCommandLongRunning } from './utils'
import { assert } from './utils'
import { Logs } from './Logs'
import { editFileAssertReverted, editFileRevert } from './editFile'
import { getCurrentTest, getCwd, getServerUrl, setRunInfo } from './getCurrentTest'
import { page } from './page'
import { TIMEOUT_NPM_SCRIPT, TIMEOUT_PLAYWRIGHT, TIMEOUT_PROCESS_TERMINATION } from './TIMEOUTS'

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

function getServerPort(): number {
  const serverUrl = getServerUrl()
  const portStr = serverUrl.split(':').slice(-1)[0]!.split('/')[0]
  assert(/\d+/.test(portStr), { serverUrl })
  const port = parseInt(portStr, 10)
  return port
}
