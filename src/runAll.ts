export { runAll }

import type { Browser } from 'playwright-chromium'
import { getCurrentTest } from './getCurrentTest'
import { Logs } from './Logs'
import { assert, assertUsage, humanizeTime, isTTY, isWindows, logProgress } from './utils'
import { type FindFilter, fsWindowsBugWorkaround } from './utils'
import { abortIfGitHubAction } from './github-action'
import { setCurrentTest } from './getCurrentTest'
import { getBrowser } from './getBrowser'
import { buildTs } from './buildTs'
import { findTestFiles } from './findTestFiles'
import { loadConfig } from './getConfig'
import { logError } from './logError'
import { hasFail, logFail, logPass, logWarn } from './logTestStatus'

async function runAll(filter: null | FindFilter) {
  await loadConfig()

  const testFiles = await findTestFiles(filter)

  const browser = await getBrowser()

  const failedTestFiles: string[] = []
  for (const testFile of testFiles) {
    const success = await buildAndTest(testFile, browser, false)
    if (!success) {
      failedTestFiles.push(testFile)
    }
  }

  await browser.close()

  const hasFailLog = hasFail()
  const hasFailedTestFile = failedTestFiles.length > 0
  if (hasFailedTestFile || hasFailLog) {
    // hasFailedTestFile and hasFailLog are redundant
    //  - When assert.ts calls logFail() this code block isn't run
    assert(hasFailedTestFile && hasFailLog)
    throw new Error('Following tests failed, see logs above for more information.')
  }
}

async function buildAndTest(testFile: string, browser: Browser, isSecondAttempt: boolean): Promise<boolean> {
  assert(testFile.endsWith('.ts'))
  const testFileJs = testFile.replace('.ts', '.mjs')
  const cleanBuild = await buildTs(testFile, testFileJs)
  setCurrentTest(testFile)
  try {
    await import(fsWindowsBugWorkaround(testFileJs) + `?cacheBuster=${Date.now()}`)
  } finally {
    cleanBuild()
  }
  const { success, clean } = await runTests(browser, isSecondAttempt)
  await clean()
  setCurrentTest(null)
  assert(testFileJs.endsWith('.mjs'))
  return success
}

async function runTests(
  browser: Browser,
  isSecondAttempt: boolean
): Promise<{ success: boolean; clean: () => Promise<void | undefined> }> {
  const testInfo = getCurrentTest()

  if (isTTY) {
    console.log()
    console.log(testInfo.testFile)
  }

  // Set when user calls `skip()`
  if (testInfo.skipped) {
    logWarn(testInfo.skipped)
    assertUsage(!testInfo.runInfo, 'You cannot call `run()` after calling `skip()`')
    assertUsage(testInfo.tests === undefined, 'You cannot call `test()` after calling `skip()`')
    return { success: true, clean: async () => {} }
  }

  const page = await browser.newPage()
  testInfo.page = page

  // Set when user calls `run()`
  assert(testInfo.runInfo)
  assert(testInfo.startServer)
  assert(testInfo.terminateServer)
  assert(testInfo.afterEach)

  // Set when user calls `test()`
  assert(testInfo.tests)

  const clean = async () => {
    await testInfo.terminateServer?.()
    await page.close()
  }
  const failure = () => {
    abortIfGitHubAction()
    return { success: false, clean }
  }

  // TODO: resolve a success flag instead rejecting
  try {
    await testInfo.startServer()
  } catch (err) {
    logFail('an error occurred while starting the server')
    logError(err)
    Logs.flushLogs()
    return failure()
  }

  for (const { testDesc, testFn } of testInfo.tests) {
    Logs.add({
      logSource: 'test()',
      logText: testDesc,
    })
    const done = logProgress(`| [test] ${testDesc}`)
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
      const hasErrorLog = Logs.hasErrorLogs(failOnWarning)
      const isFailure = err || hasErrorLog
      if (isFailure) {
        if (err) {
          logFail(`the test "${testDesc}" threw an error`)
          logError(err)
        } else if (hasErrorLog) {
          logFail(`${getErrorType(failOnWarning)} occurred while running the test "${testDesc}"`)
        } else {
          assert(false)
        }
        Logs.logErrors(failOnWarning)
        Logs.flushLogs()
        return failure()
      }
    }
    Logs.clearLogs()
  }

  // Check whether stderr emitted during testInfo.terminateServer()
  {
    const failOnWarning = true
    if (
      Logs.hasErrorLogs(failOnWarning) &&
      // See comments about taskkill in src/setup.ts
      !isWindows()
    ) {
      logFail(`${getErrorType(failOnWarning)} occurred during server termination`)
      Logs.logErrors(failOnWarning)
      Logs.flushLogs()
      return failure()
    }
  }

  Logs.clearLogs()
  logPass()

  return { success: true, clean }
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
