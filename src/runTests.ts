export { runTests }

import type { Browser } from 'playwright-chromium'
import { getCurrentTest } from './getCurrentTest'
import { Logs } from './Logs'
import { assert, assertUsage, humanizeTime, isTTY, logProgress } from './utils'
import { white, bgGreen, bgRed, bgYellow, bold } from 'picocolors'

const logsContainError_errMsg = 'The browser/server threw/logged one or more error/warning, see logs below.'

async function runTests(browser: Browser) {
  const testInfo = getCurrentTest()

  if (isTTY) {
    console.log()
    console.log(testInfo.testFile)
  }

  const page = await browser.newPage()
  testInfo.page = page

  // Set when user calls `skip()`
  if (testInfo.skipped) {
    logTestsResult(false)
    assertUsage(!testInfo.runInfo, 'You cannot call `run()` after calling `skip()`')
    assertUsage(testInfo.tests === undefined, 'You cannot call `test()` after calling `skip()`')
    return
  }

  // Set when user calls `run()`
  assert(testInfo.runInfo)
  assert(testInfo.startServer)
  assert(testInfo.terminateServer)
  assert(testInfo.afterEach)

  // Set when user calls `test()`
  assert(testInfo.tests)

  // TODO: resolve a success flag instead rejecting
  try {
    await testInfo.startServer()
  } catch (err) {
    logTestsResult(false)
    console.log(err)
    Logs.flush()
    process.exit(1)
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

    const hasErrorLog = Logs.hasError(testInfo.runInfo.onlyFailOnBrowserError)
    const isFailure = err || hasErrorLog
    if (isFailure) {
      logTestsResult(false)
      if (err) {
        console.error(err)
      }
      if (hasErrorLog) {
        console.log(new Error(logsContainError_errMsg))
      }
      Logs.flush()
      process.exit(1)
    } else {
      Logs.clear()
    }
  }

  await testInfo.terminateServer()
  await page.close()
  // Handle case that an error occured during `terminateServer()`
  if (Logs.hasError()) {
    console.log(new Error(logsContainError_errMsg))
    Logs.flush()
  }

  logTestsResult(true)
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

function logTestsResult(success: boolean) {
  const testInfo = getCurrentTest()
  const passStyle = (t: string) => bold(white(bgGreen(t)))
  const failStyle = (t: string) => bold(white(bgRed(t)))
  const skipStyle = (t: string) => bold(white(bgYellow(t)))
  if (success) {
    assert(!testInfo.skipped)
    console.log(`${passStyle('PASS')} ${testInfo.testFile}`)
    return
  }
  if (testInfo.skipped) {
    console.log(`${skipStyle('WARN')} ${testInfo.testFile} (${testInfo.skipped})`)
  } else {
    console.log(`${failStyle('FAIL')} ${testInfo.testFile}`)
  }
}
