export { runCommandLongRunning }

import { spawn } from 'child_process'
import stripAnsi from 'strip-ansi'
import { assert, runCommandShortLived, humanizeTime, isWindows, isLinux, isCallable } from '../utils'
import type { ChildProcessWithoutNullStreams } from 'child_process'

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
        errMsg = `Unexpected termination of command \`${cmd}\` with exit code ${code}`
      } else if (!exitIsExpected) {
        errMsg = `Unexpected premature termination of command \`${cmd}\` (with success exit code ${code})`
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

async function killByPort(port: number) {
  assert(isLinux())
  assert(port)
  await runCommandShortLived(`fuser -k ${port}/tcp`, { swallowError: true, timeout: 10 * 1000 })
}

function isSuccessCode(code: number | null): boolean {
  return code === 0 || code === null || (code === 1 && isWindows())
}
