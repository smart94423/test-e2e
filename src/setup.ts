import { spawn } from 'child_process'
import type { ChildProcessWithoutNullStreams } from 'child_process'
import { dirname } from 'path'
import type { ConsoleMessage } from 'playwright-chromium'
import {
  runCommandShortLived,
  sleep,
  logProgress,
  cliConfig,
  humanizeTime,
  isWindows,
  isLinux,
  isCI,
  isMac,
  isCallable,
  isTTY,
  isObject,
} from './utils'
import fetch_ from 'node-fetch'
import { assert } from './utils'
import { Logs } from './Logs'
import stripAnsi from 'strip-ansi'
import { editFileAssertReverted, editFileRevert } from './editFile'
import { getCurrentTest } from './getCurrentTest'
import { page } from './page'
import { logBoot } from './logTestStatus'

export { partRegex } from '@brillout/part-regex'
export { autoRetry }
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

const serverUrlDefault = 'http://localhost:3000'

const TIMEOUT_NPM_SCRIPT = 2 * 60 * 1000 * (!isCI() ? 1 : isWindows() ? 2 : 1)
const TIMEOUT_TEST_FUNCTION = 60 * 1000 * (!isCI() ? 1 : isWindows() ? 5 : 3)
const TIMEOUT_PROCESS_TERMINATION = 10 * 1000 * (!isCI() ? 1 : isWindows() ? 3 : !isLinux() ? 3 : 1)
const TIMEOUT_AUTORETRY = TIMEOUT_TEST_FUNCTION / 2
const TIMEOUT_PLAYWRIGHT = TIMEOUT_TEST_FUNCTION / 2

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
    doNotFailOnWarning = false,
    serverUrl = serverUrlDefault,
    isFlaky = false,
  }: {
    //baseUrl?: string
    additionalTimeout?: number
    serverIsReadyMessage?: string | ((log: string) => boolean)
    serverIsReadyDelay?: number
    inspect?: boolean
    cwd?: string
    doNotFailOnWarning?: boolean
    serverUrl?: string
    isFlaky?: boolean
  } = {}
) {
  additionalTimeout += serverIsReadyDelay

  const testInfo = getCurrentTest()
  testInfo.runInfo = {
    cmd,
    cwd: cwd || getCwd(),
    additionalTimeout,
    testFunctionTimeout: TIMEOUT_TEST_FUNCTION + additionalTimeout,
    serverIsReadyMessage,
    serverIsReadyDelay,
    inspect,
    doNotFailOnWarning,
    serverUrl,
    isFlaky,
  }

  if (inspect) {
    Logs.logEagerly = true
  }

  let runProcess: RunProcess | null = null
  testInfo.startServer = async () => {
    runProcess = await startProcess()

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

function getRunInfo() {
  const testInfo = getCurrentTest()
  assert(testInfo.runInfo)
  return testInfo.runInfo
}

type RunProcess = {
  terminate: (force?: true) => Promise<void>
}
async function startProcess(): Promise<RunProcess> {
  const runInfo = getRunInfo()
  const { cmd, cwd, additionalTimeout, serverIsReadyDelay } = runInfo
  let { serverIsReadyMessage } = runInfo

  if (isTTY) {
    console.log()
    logBoot()
  }

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
  if (err) {
    Logs.add({
      logSource: 'run() failure',
      logText: getErrMsg(err),
    })
  } else {
    Logs.add({
      logSource: 'run()',
      logText: 'Server is ready.',
    })
  }
  done(!!err)

  await sleep(serverIsReadyDelay)

  return { terminate }
}

function stopProcess({
  proc,
  cwd,
  cmd,
  force,
  onTerminationError,
}: {
  proc: ChildProcessWithoutNullStreams
  cwd: string
  cmd: string
  force?: true
  onTerminationError: (errMsg: string) => void
}) {
  let resolve: () => void
  const promise = new Promise<void>((_resolve, _reject) => {
    resolve = _resolve
  })

  const onProcessClose = (code: number) => {
    if (!isSuccessCode(code)) {
      onTerminationError(`Command \`${cmd}\` (${cwd}) terminated with non-0 error code ${code}`)
    }
    resolve()
  }
  proc.on('close', onProcessClose)
  proc.on('exit', onProcessClose)

  const { pid } = proc
  assert(pid)
  if (isWindows()) {
    // - https://github.com/nodejs/node/issues/3617#issuecomment-377731194
    // - https://stackoverflow.com/questions/23706055/why-can-i-not-kill-my-child-process-in-nodejs-on-windows/28163919#28163919
    // - taskkill seems to be buggy in many ways:
    //   - taskkill seems to make the process exit with code `1`
    //   - Because process exits with code `1`, Node.js/npm complains:
    //     ```
    //     [15:36:10.626][\examples\react][npm run preview][stderr] npm
    //     [15:36:10.626][\examples\react][npm run preview][stderr]
    //     [15:36:10.626][\examples\react][npm run preview][stderr] ERR!
    //     [15:36:10.626][\examples\react][npm run preview][stderr]
    //     [15:36:10.626][\examples\react][npm run preview][stderr] code
    //     [15:36:10.626][\examples\react][npm run preview][stderr] ELIFECYCLE
    //     ```
    //     Because stderr isn't empty, runTests() believes that the termination failed.
    //   - taskkill sometimes throws:
    //     ```
    //     ERROR: The process with PID 6052 (child process of PID 3184) could not be terminated.
    //     Reason: There is no running instance of the task.
    //     ```
    //     ```
    //     ERROR: The process "6564" not found.
    //     ```
    //     There doesn't seem to be an option to suppress these errors: https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/taskkill#parameters
    assert(typeof pid === 'number')
    spawn('taskkill', ['/pid', String(pid), '/f', '/t'], {
      stdio: [
        'ignore', // stdin
        // Ignore following log to avoid polluting non-error logs. (Setting 'inherit' instead of 'ignore' attaches stdout to the root process and not to `proc` which is why the stdout of taskkill isn't intercepted by `proc.stdout.on('data', () => /* ... */)`.)
        // ```
        // SUCCESS: The process with PID 6932 (child process of PID 2744) has been terminated.
        // ```
        'ignore', // stdout
        // Ignoring stderr doesn't solve the problem that taskkill makes the process exit with code 1
        'inherit', // stderr
      ],
    })
  } else {
    assert(typeof pid === 'number')
    const processGroup = -1 * pid
    const signal = force ? 'SIGKILL' : 'SIGTERM'
    process.kill(processGroup, signal)
    /*
      try {
        process.kill(-proc.pid, signal)
      } catch (err: unknown) {
        // ESRCH: No process or process group can be found corresponding to that specified by pid.
        //  => probably means that the process was killed already.
        if (typeof err === 'object' && err !== null && 'code' in err && err['code'] === 'ESRCH') {
          printLog('stdout', '=============== swallowError')
          return
        } else {
          printLog('stdout', '=============== no swallowError')
          throw err
        }
      }
      */
  }

  return promise
}

function runCommandLongRunning({
  cmd,
  cwd,
  killPort,
  isReadyLog,
  isReadyTimeout,
  onStdout,
  onStderr,
  onExit,
  onTerminationError,
  terminationTimeout,
}: {
  cmd: string
  cwd: string
  killPort: false | number
  isReadyLog: string | ((log: string) => boolean)
  isReadyTimeout: number
  onStdout: (log: string, info: { loggedAfterExit: boolean }) => void
  onStderr: (log: string, info: { loggedAfterExit: boolean }) => void
  onExit: (errMsg?: string) => void
  onTerminationError: (errMsg: string) => void
  terminationTimeout: number
}): { terminate: (force?: true) => Promise<void>; isReadyPromise: Promise<void> } {
  if (killPort) killByPort(killPort)

  let onError: (err: Error, alreadyTerminated?: true) => void
  let onReady: () => void
  let isReady = false
  const isReadyPromise = new Promise<void>((resolve_, reject_) => {
    onReady = () => {
      clearTimeout(isReadyPromiseTimeout)
      assert(!procExited)
      isReady = true
      resolve_()
    }
    onError = async (err, alreadyTerminated) => {
      clearTimeout(isReadyPromiseTimeout)
      // We reject before terminating the process in order to preserve log order. (This order is fine because the test runner doesn't exit upon test failure.)
      reject_(err)
      if (!alreadyTerminated) {
        assert(!procExited)
        await terminateProc(true)
      }
      assert(procExited)
    }
  })

  let isReadyPromiseTimedOut = false
  const isReadyPromiseTimeout = setTimeout(async () => {
    isReadyPromiseTimedOut = true
    let errMsg = `Command \`${cmd}\` not ready after ${humanizeTime(isReadyTimeout)}.`
    if (typeof isReadyLog === 'string') {
      errMsg += ` The stdout of the command did not (yet?) include "${isReadyLog}".`
    }
    onError(new Error(errMsg))
  }, isReadyTimeout)

  let [command, ...args] = cmd.split(' ')
  let detached = true
  if (isWindows()) {
    detached = false
    if (command === 'npm' || command === 'pnpm') {
      command = command + '.cmd'
    }
  }
  const proc = spawn(command, args, { cwd, detached })

  let procExited = false

  proc.stdin.on('data', async (chunk: Buffer) => {
    const data = String(chunk)
    onError(new Error(`Command \`${cmd}\` (${cwd}) is invoking stdin which is forbidden. The stdin data: ${data}`))
  })
  proc.stdout.on('data', (chunk: Buffer) => {
    const log = String(chunk)
    onStdout(log, { loggedAfterExit: procExited })
    {
      const logCleaned = stripAnsi(log)
      let isMatch = false
      if (typeof isReadyLog === 'string') {
        isMatch = logCleaned.includes(isReadyLog)
      } else if (isCallable(isReadyLog)) {
        isMatch = isReadyLog(logCleaned)
      } else {
        assert(false)
      }
      if (isMatch) onReady()
    }
  })
  proc.stderr.on('data', async (chunk: Buffer) => {
    const log = String(chunk)
    onStderr(log, { loggedAfterExit: procExited })
    if (log.includes('EADDRINUSE')) {
      onError(new Error('Port conflict? Port already in use EADDRINUSE.'))
    }
  })
  let exitPromiseResolve!: () => void
  const exitPromise = new Promise<void>((r) => (exitPromiseResolve = r))
  proc.on('exit', (code) => {
    procExited = true

    let errMsg: string | undefined
    {
      const exitIsExpected = isReady === true || isReadyPromiseTimedOut
      if (!isSuccessCode(code)) {
        errMsg = `Unexpected error while running command \`${cmd}\` with exit code ${code}`
      } else if (!exitIsExpected) {
        errMsg = 'Unexpected premature process termination'
      }
    }

    // We add errMsg to onExit() because isReadyPromise may have already returned
    onExit(errMsg)

    if (errMsg) {
      onError(new Error(errMsg), true)
    } else {
      assert(isReady)
    }

    exitPromiseResolve()
  })

  return {
    isReadyPromise,
    async terminate() {
      if (procExited) return
      await terminateProc()
    },
  }

  async function terminateProc(force?: true) {
    let resolve!: () => void
    let reject!: (err: Error) => void
    const promise = new Promise<void>((resolve_, reject_) => {
      resolve = async () => {
        resolve_()
      }
      reject = () => {
        reject_()
      }
    })

    const terminateTimeout = setTimeout(() => {
      const errMsg = 'Process termination timeout. Cmd: ' + cmd
      onTerminationError(errMsg)
      /* Don't interrupt the test runner, as the test runner may recover thanks to killByPort() (EDIT: this is actually inaccurate since killByPort() isn't called in CI. Maybe we should reject?)
      reject(new Error(errMsg))
      */
      resolve()
    }, terminationTimeout)

    assert(proc)
    await stopProcess({
      proc,
      cwd,
      cmd,
      force,
      onTerminationError,
    })
    clearTimeout(terminateTimeout)
    await exitPromise
    resolve()
    return promise
  }
}

async function killByPort(port: number) {
  assert(isLinux())
  assert(port)
  await runCommandShortLived(`fuser -k ${port}/tcp`, { swallowError: true, timeout: 10 * 1000 })
}

async function autoRetry(
  test: () => void | Promise<void>,
  { timeout = TIMEOUT_AUTORETRY }: { timeout?: number } = {}
): Promise<void> {
  const period = 100
  const numberOfTries = timeout / period
  let i = 0
  while (true) {
    try {
      await test()
      return
    } catch (err) {
      i = i + 1
      if (i > numberOfTries) {
        throw err
      }
    }
    await sleep(period)
  }
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

function getCwd() {
  const { testFile } = getCurrentTest()
  const cwd = dirname(testFile)
  return cwd
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

function getErrMsg(err: unknown): string {
  assert(isObject(err))
  const errMsg = err.message
  assert(errMsg)
  assert(typeof errMsg === 'string')
  return errMsg
}

function isSuccessCode(code: number | null): boolean {
  return code === 0 || code === null || (code === 1 && isWindows())
}
