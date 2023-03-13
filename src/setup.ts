import { spawn } from 'child_process'
import type { ChildProcessWithoutNullStreams } from 'child_process'
import { dirname } from 'path'
import type { ConsoleMessage } from 'playwright-chromium'
import {
  runCommand,
  sleep,
  logProgress,
  cliConfig,
  humanizeTime,
  isWindows,
  isLinux,
  isCI,
  isMac,
  isCallable,
} from './utils'
import fetch_ from 'node-fetch'
import { assert } from './utils'
import { Logs } from './Logs'
import stripAnsi from 'strip-ansi'
import { editFileAssertReverted, editFileRevert } from './editFile'
import { getCurrentTest } from './getCurrentTest'
import { page } from './page'

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
  testInfo.skipped = reason
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
    runProcess = await start()

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

    // `runProcess` is `undefined` if `start()` failed.
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
async function start(): Promise<RunProcess> {
  const { cmd, additionalTimeout, serverIsReadyMessage, serverIsReadyDelay } = getRunInfo()
  const done = logProgress(`| [run] ${cmd}`)

  let hasSuccessfullyStarted = false
  let resolveServerStart: () => void
  let rejectServerStart: (err: Error) => void
  const promise = new Promise<RunProcess>((_resolve, _reject) => {
    resolveServerStart = () => {
      assert(!processHasExited())
      assert(getRunInfo().cmd === cmd)
      Logs.add({
        logSource: 'run()',
        logText: 'Server is ready.',
      })
      hasSuccessfullyStarted = true
      clearTimeout(serverStartTimeout)
      const runProcess = { terminate }
      _resolve(runProcess)
    }
    rejectServerStart = async (err: Error) => {
      assert(processHasExited())
      assert(getRunInfo().cmd === cmd)
      done(true)
      clearTimeout(serverStartTimeout)
      _reject(err)
    }
  })

  const timeoutTotal = TIMEOUT_NPM_SCRIPT + additionalTimeout
  let hasTimedout = false
  const serverStartTimeout = setTimeout(async () => {
    hasTimedout = true
    let errMsg = ''
    errMsg += `Server still didn't start after ${humanizeTime(timeoutTotal)} of running the npm script \`${cmd}\`.`
    if (serverIsReadyMessage) {
      errMsg += ` (The stdout of the npm script did not include: "${serverIsReadyMessage}".)`
    }
    Logs.add({
      logSource: 'run() failure',
      logText: errMsg,
    })
    await terminate(true)
    rejectServerStart(new Error(errMsg))
  }, timeoutTotal)

  // Kill any process that listens to the server port
  if (!process.env.CI && isLinux()) {
    const port = getPort()
    assert(/\d+/.test(port))
    await runCommand(`fuser -k ${port}/tcp`, { swallowError: true, timeout: 10 * 1000 })
  }

  const { terminate, processHasExited } = execRunScript({
    async onFailure(err) {
      assert(processHasExited())
      rejectServerStart(err as Error)
    },
    onExit() {
      assert(processHasExited())
      const exitIsPossible = hasSuccessfullyStarted === true || hasTimedout
      return exitIsPossible
    },
    async onStdout(data: string) {
      const log = stripAnsi(data)
      const isServerReady =
        // Custom
        (typeof serverIsReadyMessage === 'string' && log.includes(serverIsReadyMessage)) ||
        (isCallable(serverIsReadyMessage) && serverIsReadyMessage(log)) ||
        // Express.js server
        log.includes('Server running at') ||
        // npm package `serve`
        log.includes('Accepting connections at') ||
        // Vite
        (log.includes('Local:') && log.includes('http://localhost:3000/'))
      if (isServerReady) {
        assert(serverIsReadyDelay)
        await sleep(serverIsReadyDelay)
        resolveServerStart()
        done()
      }
    },
  })

  return promise
}

function stopProcess({
  proc,
  cwd,
  cmd,
  force,
}: {
  proc: ChildProcessWithoutNullStreams
  cwd: string
  cmd: string
  force?: true
}) {
  const prefix = `[Run Stop][${cwd}][${cmd}]`

  let resolve: () => void
  let reject: (err: Error) => void
  const promise = new Promise<void>((_resolve, _reject) => {
    resolve = _resolve
    reject = _reject
  })

  const onProcessClose = (code: number) => {
    if (code === 0 || code === null || (code === 1 && isWindows())) {
      resolve()
    } else {
      reject(new Error(`${prefix} Terminated with non-0 error code ${code}`))
    }
  }
  proc.on('close', onProcessClose)
  proc.on('exit', onProcessClose)
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
    spawn('taskkill', ['/pid', String(proc.pid), '/f', '/t'], {
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
    assert(proc.pid)
    const processGroup = -1 * proc.pid
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

function execRunScript({
  onStdout,
  onFailure,
  onExit,
}: {
  onStdout?: (data: string) => void | Promise<void>
  onFailure: (err: Error) => void | Promise<void>
  onExit: () => boolean
}) {
  const { cwd, cmd } = getRunInfo()
  let [command, ...args] = cmd.split(' ')
  let detached = true
  if (isWindows()) {
    detached = false
    if (command === 'npm' || command === 'pnpm') {
      command = command + '.cmd'
    }
  }
  Logs.add({
    logSource: 'run()',
    logText: `Spawn command \`${cmd}\``,
  })
  const proc = spawn(command, args, { cwd, detached })

  let procExited = false
  let procIsExiting = false

  const exitAndFail = async (err: Error) => {
    Logs.add({
      logText: err.message,
      logSource: 'run() failure',
    })
    await terminate(true)
    onFailure(err)
  }

  proc.stdin.on('data', async (chunk: Buffer) => {
    const data = String(chunk)
    await exitAndFail(new Error(`Command is \`${cmd}\` (${cwd}) is invoking \`stdin\`: ${data}.`))
  })
  proc.stdout.on('data', (chunk: Buffer) => {
    const data = String(chunk)
    Logs.add({
      logSource: 'stdout',
      logText: data,
    })
    /* These assertions sometimes fail, see comments in assertNotExited()
    assertNotExited(data)
    assert(getRunInfo().cmd === cmd)
    /*/
    if (procExited) return undefined
    //*/
    onStdout?.(data)
  })
  proc.stderr.on('data', async (chunk: Buffer) => {
    const data = String(chunk)
    Logs.add({
      logSource: 'stderr',
      logText: data,
    })
    /* These assertions sometimes fail, see comments in assertNotExited()
    assertNotExited(data)
    assert(getRunInfo().cmd === cmd)
    /*/
    if (procExited) return undefined
    //*/

    // taskkill makes process exit with exit code `1`, which makes `npm run` emit error logs => we swallow these false errors. (See comments about taskkill in stopProcess().) Because the logs npm emits on stderr are convoluted and spread across multiple lines/chunks, we cannot easily be precise about what we swallow.
    if (isWindows() && procIsExiting) return undefined

    if (data.includes('EADDRINUSE')) {
      await exitAndFail(new Error('Port conflict? Port already in use EADDRINUSE.'))
    }
  })
  let exitPromiseResolve!: () => void
  const exitPromise = new Promise<void>((r) => (exitPromiseResolve = r))
  proc.on('exit', (code) => {
    procExited = true
    assert(getRunInfo().cmd === cmd)
    const exitIsPossible = onExit()
    const isSuccessCode = [0, null].includes(code) || (isWindows() && code === 1)
    const isExpected = isSuccessCode && exitIsPossible
    if (!isExpected) {
      const errMsg = `Unexpected premature process termination, exit code: ${code}`
      Logs.add({
        logText: errMsg,
        logSource: 'run() failure',
      })
      onFailure(new Error(errMsg))
    } else {
      Logs.add({
        logText: `Process termination. (Nominal, exit code: ${code}.)`,
        logSource: 'run()',
      })
    }
    exitPromiseResolve()
  })

  return { terminate, processHasExited }

  /* Node.js seems to occasionally emit 'data' events after having the emitted 'exit' event, for example:
   *  - `{"data":"[0] npm run serve:cdn  exited with code SIGTERM\n","dataLength":48}`.
  function assertNotExited(data: string) {
    if (!procExited) return
    // Sometimes, a single white space is emitted after 'exit' has been emitted.
    if (data.trim().length === 0) return
    assert(false, { data, dataLength: data.length })
  }
  */

  function processHasExited(): boolean {
    return procExited
  }

  async function terminate(force?: true) {
    let resolve!: () => void
    let reject!: (err: Error) => void
    procIsExiting = true
    const promise = new Promise<void>((_resolve, _reject) => {
      resolve = () => {
        procIsExiting = false
        _resolve()
      }
      reject = () => {
        procIsExiting = false
        _reject()
      }
    })

    const timeout = setTimeout(() => {
      const errMsg = 'Process termination timeout. Cmd: ' + cmd
      Logs.add({
        logSource: 'run() failure',
        logText: errMsg,
      })
      /* Don't interrupt the test runner, as the test runner may recover thanks to the process-killing-by-port
      reject(new Error(errMsg))
      */
      resolve()
    }, TIMEOUT_PROCESS_TERMINATION)

    assert(proc)
    try {
      await stopProcess({
        proc,
        cwd,
        cmd,
        force,
      })
    } catch (err) {
      Logs.add({
        logSource: 'run() failure',
        logText: String(err),
      })
    }
    clearTimeout(timeout)
    await exitPromise
    resolve()
    return promise
  }
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

function getPort(): string {
  const serverUrl = getServerUrl()
  const port = serverUrl.split(':').slice(-1)[0]!.split('/')[0]
  assert(/\d+/.test(port), { serverUrl })
  return port
}
