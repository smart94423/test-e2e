export { runTests }
export { logFailure }

import type { Browser } from 'playwright-chromium'
import { getCurrentTest } from './getCurrentTest'
import { Logs } from './Logs'
import { assert, assertUsage, humanizeTime, isTTY, isWindows, logProgress } from './utils'
import { type FindFilter, fsWindowsBugWorkaround } from './utils'
import pc from 'picocolors'
import { abortIfGitHubAction } from './github-action'
import { setCurrentTest } from './getCurrentTest'

import { getBrowser } from './getBrowser'
import { buildTs } from './buildTs'
import { findTestFiles } from './findTestFiles'
import { loadConfig } from './getConfig'
import { logError } from './logError'

let hasFailure = false

async function runTests(filter: null | FindFilter) {
  await loadConfig()

  const testFiles = await findTestFiles(filter)

  const browser = await getBrowser()

  let hasFailedTest = false
  for (const testFile of testFiles) {
    assert(testFile.endsWith('.ts'))
    const testFileJs = testFile.replace('.ts', '.mjs')
    const clean = await buildTs(testFile, testFileJs)
    setCurrentTest(testFile)
    try {
      await import(fsWindowsBugWorkaround(testFileJs))
    } finally {
      clean()
    }
    const success = await runTestFile(browser)
    if (!success) {
      hasFailedTest = true
    }
    setCurrentTest(null)
    assert(testFileJs.endsWith('.mjs'))
  }

  await browser.close()

  if (hasFailedTest || hasFailure) {
    // hasFailedTest and hasFailure are redundant
    //  - When assert.ts calls logFailure() this code block isn't run
    assert(hasFailedTest && hasFailure)
    throw new Error('A test failed. See messages above.')
  }
}

async function runTestFile(browser: Browser): Promise<boolean> {
  const testInfo = getCurrentTest()

  if (isTTY) {
    console.log()
    console.log(testInfo.testFile)
  }

  const page = await browser.newPage()
  testInfo.page = page

  // Set when user calls `skip()`
  if (testInfo.skipped) {
    logTestStatus(false)
    assertUsage(!testInfo.runInfo, 'You cannot call `run()` after calling `skip()`')
    assertUsage(testInfo.tests === undefined, 'You cannot call `test()` after calling `skip()`')
    return true
  }

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
  const abort = async () => {
    await clean()
    abortIfGitHubAction()
  }

  // TODO: resolve a success flag instead rejecting
  try {
    await testInfo.startServer()
  } catch (err) {
    logFailure('an error occurred while starting the server')
    logError(err)
    Logs.flushLogs()
    await abort()
    return false
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
          logFailure(`the test "${testDesc}" threw an error`)
          logError(err)
        } else if (hasErrorLog) {
          logFailure(`${getErrorType(failOnWarning)} occurred while running the test "${testDesc}"`)
        } else {
          assert(false)
        }
        Logs.logErrors(failOnWarning)
        Logs.flushLogs()
        await abort()
        return false
      }
    }
    Logs.clearLogs()
  }

  await clean()

  // Check whether stderr emitted during testInfo.terminateServer()
  {
    const failOnWarning = true
    if (
      Logs.hasErrorLogs(failOnWarning) &&
      // See comments about taskkill in src/setup.ts
      !isWindows()
    ) {
      logFailure(`${getErrorType(failOnWarning)} occurred during server termination`)
      Logs.logErrors(failOnWarning)
      Logs.flushLogs()
      await abort()
      return false
    }
  }

  Logs.clearLogs()
  logTestStatus(true)

  return true
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

function logTestStatus(success: boolean) {
  const testInfo = getCurrentTest()
  const { PASS, FAIL, WARN } = getStatusTags()
  if (success) {
    assert(!testInfo.skipped)
    console.log(`${PASS} ${testInfo.testFile}`)
    return
  }
  if (testInfo.skipped) {
    console.log(`${WARN} ${testInfo.testFile} (${testInfo.skipped})`)
  } else {
    console.log(`${FAIL} ${testInfo.testFile}`)
  }
}

function logFailure(reason: string) {
  hasFailure = true
  logTestStatus(false)
  const { FAIL } = getStatusTags()
  const color = (s: string) => pc.red(pc.bold(s))
  const msg = `Test ${FAIL} because ${reason}, see below.`
  console.log(color(msg))
}

function getStatusTags() {
  const PASS = pc.bold(pc.bgGreen(pc.white(' PASS ')))
  const FAIL = pc.bold(pc.bgRed(pc.white(' FAIL ')))
  const WARN = pc.bold(pc.bgYellow(pc.white(' WARN ')))
  return { PASS, FAIL, WARN }
}
