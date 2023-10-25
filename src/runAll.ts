export { runAll }

import type { Browser } from 'playwright-chromium'
import { getCurrentTest, type TestInfo } from './getCurrentTest'
import { Logs } from './Logs'
import { assert, assertUsage, cliOptions, humanizeTime, isCI, isWindows, logProgress } from './utils'
import { type FindFilter, fsWindowsBugWorkaround } from './utils'
import { setCurrentTest } from './getCurrentTest'
import { getBrowser } from './getBrowser'
import { buildTs } from './buildTs'
import { findTestFiles } from './findTestFiles'
import { loadConfig } from './getConfig'
import { logError } from './logError'
import { hasFail, logBoot, logFail, logPass, logWarn } from './logTestStatus'
import pc from '@brillout/picocolors'

async function runAll(filter: null | FindFilter) {
  await loadConfig()

  const testFiles = await findTestFiles(filter)

  const browser = await getBrowser()

  const failedTestFiles = await runTestFiles(testFiles, browser)

  await browser.close()

  const hasFailedTestFile = failedTestFiles.length > 0
  const hasFailLog = hasFail()
  if (hasFailedTestFile || hasFailLog) {
    // hasFailedTestFile and hasFailLog are redundant
    //  - When assert.ts calls logFail() this code block isn't run
    assert(hasFailedTestFile && hasFailLog)
    assert(failedTestFiles.length > 0)
    throw new Error(
      pc.red(
        pc.bold(
          [
            'Following test files failed, see logs above for more information (search for [TEST_FAILURE]):',
            ...failedTestFiles.map((testFile) => `❌ ${pc.bold(testFile)}`),
          ].join('\n')
        )
      )
    )
  }
}

async function runTestFiles(testFiles: string[], browser: Browser): Promise<string[]> {
  // First attempt
  let failedTestFiles: string[] = []
  let doNotRetry = false
  for (const testFile of testFiles) {
    const { success, isFlaky } = await buildAndTest(testFile, browser, false)
    if (!success) {
      failedTestFiles.push(testFile)
      if (!isFlaky) {
        doNotRetry = true
      }
      if (cliOptions.bail) {
        return failedTestFiles
      }
    }
  }

  if (doNotRetry) {
    return failedTestFiles
  }

  if (!isCI()) {
    return failedTestFiles
  } else {
    // Second & third attempt
    for (let i = 0; i <= 1; i++) {
      console.log('[' + (i === 0 ? 'SECOND' : 'THIRD') + '_ATTEMPT]')
      for (const testFile of failedTestFiles) {
        const { success } = await buildAndTest(testFile, browser, i === 1)
        if (success) {
          failedTestFiles = failedTestFiles.filter((t) => t !== testFile)
        }
      }
    }
    return failedTestFiles
  }
}

async function buildAndTest(testFile: string, browser: Browser, isThirdAttempt: boolean) {
  assert(testFile.endsWith('.ts'))
  const testFileJs = testFile.replace('.ts', '.mjs')
  assert(testFileJs.endsWith('.mjs'))
  const cleanBuild = await buildTs(testFile, testFileJs)
  setCurrentTest(testFile)

  logBoot()
  let execErr: unknown
  try {
    await import(fsWindowsBugWorkaround(testFileJs) + `?cacheBuster=${Date.now()}`)
  } catch (err) {
    assert(err)
    execErr = err
  } finally {
    cleanBuild()
  }
  if (execErr) {
    logFail(`an error was thrown while executing the file ${testFile}`, true)
    logError(execErr)
    return {
      success: false,
      isFlaky: false,
    }
  }

  // When user calls skip()
  const testInfo = getCurrentTest()
  if (testInfo.skipped) {
    assertSkipUsage(testInfo)
    logWarn(testInfo.skipped.reason)
    return {
      success: true,
      isFlaky: false,
    }
  } else {
    // Set when user calls run() or runCommandThatTerminates()
    assert(testInfo.runInfo)
  }
  const { isFlaky } = testInfo.runInfo

  // When user calls run runCommandThatTerminates()
  if (testInfo.runInfo.isRunCommandThatTerminates) {
    assertUsage(!testInfo.tests, "Can't call test() when calling runCommandThatTerminates()")
    assertUsage(!testInfo.startServer, "Can't call run() when calling runCommandThatTerminates()")
    logPass()
    return {
      success: true,
      isFlaky,
    }
  }

  const success = await runServerAndTests(browser, isThirdAttempt, isFlaky)
  setCurrentTest(null)
  return { success, isFlaky }
}

async function runServerAndTests(browser: Browser, isThirdAttempt: boolean, isFlaky: boolean): Promise<boolean> {
  const testInfo = getCurrentTest()
  assert(testInfo.startServer)
  assert(testInfo.terminateServer)

  const isFinalAttempt: boolean = isThirdAttempt || !isFlaky

  const page = await browser.newPage()
  testInfo.page = page

  try {
    await testInfo.startServer()
  } catch (err) {
    logFailure(err, 'an error occurred while starting the server', isFinalAttempt)
    return false
  }

  let success = await runTests(testInfo, isFinalAttempt)

  await testInfo.terminateServer()
  await page.close()
  // Check whether stderr emitted during testInfo.terminateServer()
  if (success) {
    const failOnWarning = true
    if (
      Logs.hasFailLogs(failOnWarning) &&
      // See comments about taskkill in src/utils/runCommandLongRunning.ts
      !isWindows()
    ) {
      logFailure(null, `${getErrorType(failOnWarning)} occurred during server termination`, isFinalAttempt)
      success = false
    }
  }

  if (success) {
    logPass()
  }
  Logs.clearLogs()

  return success
}

async function runTests(testInfo: TestInfo, isFinalAttempt: boolean): Promise<boolean> {
  // Set when user calls run()
  assert(testInfo.runInfo)
  assert(testInfo.afterEach)
  const tests =
    // Set when user calls test()
    testInfo.tests ??
    // When user hasn't any test() call
    []
  for (const { testDesc, testFn } of tests) {
    Logs.add({
      logSource: 'test()',
      logText: testDesc,
    })
    const done = logProgress(`[test] ${testDesc}`)
    let err: unknown
    try {
      await runTest(testFn, testInfo.runInfo.testFunctionTimeout)
    } catch (err_) {
      err = err_
    }
    done(!!err)
    testInfo.afterEach(!!err)
    {
      const failOnWarning = !testInfo.runInfo.doNotFailOnWarning
      const hasErrorLog = Logs.hasFailLogs(failOnWarning)
      const isFailure = err || hasErrorLog
      if (isFailure) {
        if (err) {
          logFailure(err, `the test "${testDesc}" threw an error`, isFinalAttempt)
        } else if (hasErrorLog) {
          logFailure(
            null,
            `${getErrorType(failOnWarning)} occurred while running the test "${testDesc}"`,
            isFinalAttempt
          )
        } else {
          assert(false)
        }
        return false
      }
    }
    Logs.clearLogs()
  }

  return true
}

function logFailure(err: null | unknown, reason: string, isFinalAttempt: boolean) {
  logFail(reason, isFinalAttempt)
  if (err) {
    logError(err)
  }
  Logs.logErrorsAndWarnings()
  Logs.flushLogs()
}

function getErrorType(failOnWarning: boolean) {
  return !failOnWarning ? 'error(s)' : 'error(s)/warning(s)'
}

function runTest(testFn: Function, testFunctionTimeout: number): Promise<undefined | unknown> {
  let resolve!: () => void
  let reject!: (err: unknown) => void
  const promise = new Promise<void>((resolve_, reject_) => {
    resolve = resolve_
    reject = reject_
  })

  const timeout = setTimeout(() => {
    reject(new Error(`[test] Timeout after ${humanizeTime(testFunctionTimeout)}`))
  }, testFunctionTimeout)

  const ret: unknown = testFn()
  ;(async () => {
    try {
      await ret
      resolve()
    } catch (err) {
      reject(err)
    } finally {
      clearTimeout(timeout)
    }
  })()

  return promise
}

function assertSkipUsage(testInfo: TestInfo) {
  assert(testInfo.skipped)
  {
    const err = 'You cannot call run() after calling skip()'
    assertUsage(testInfo.runInfo === undefined, err)
  }
  {
    const err = 'You cannot call test() after calling skip()'
    assertUsage(testInfo.tests === undefined, err)
  }
}
