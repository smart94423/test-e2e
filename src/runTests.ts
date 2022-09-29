export { runTests }

import type { Browser } from 'playwright-chromium'
import { getCurrentTest } from './getCurrentTest'
import { Logs } from './Logs'
import { assert, assertUsage, humanizeTime, isTTY, logProgress } from './utils'
import { white, bgGreen, bgRed, bgYellow, bold } from 'picocolors'

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
    assertUsage(!testInfo.runInfo, 'You cannot call `run()` after calling `skip()`')
    assertUsage(testInfo.tests === undefined, 'You cannot call `test()` after calling `skip()`')
    logTestsResult(false)
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
    console.log(err)
    Logs.flush()
    logTestsResult(false)
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
      await runTest(testFn, testInfo.runInfo.testTimeout)
    } catch (err_) {
      err = err_
    }
    done(!!err)
    testInfo.afterEach(!!err)

    const browserErrors = Logs.getBrowserErrors()
    const browserThrewError = browserErrors.length > 0
    const isFailure = err || browserThrewError
    if (isFailure) {
      if (err) {
        console.error(err)
      }
      if (browserThrewError) {
        console.log(new Error('The browser threw one or more error'))
      }
      Logs.flush()
      logTestsResult(false)
      process.exit(1)
    } else {
      Logs.clear()
    }
  }

  await testInfo.terminateServer()
  await page.close()
  logTestsResult(true)
}

function runTest(testFn: Function, testTimeout: number): Promise<undefined | unknown> {
  let resolve!: () => void
  let reject!: (err: unknown) => void
  const promise = new Promise<void>((resolve_, reject_) => {
    resolve = resolve_
    reject = reject_
  })

  const timeout = setTimeout(() => {
    reject(new Error(`[test] Timeout after ${humanizeTime(testTimeout)}`))
  }, testTimeout)

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
    console.log(`${skipStyle('SKIP')} ${testInfo.testFile} (${testInfo.skipped})`)
  } else {
    console.log(`${failStyle('FAIL')} ${testInfo.testFile}`)
  }
}
