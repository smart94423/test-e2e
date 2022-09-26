export { runTests }

import type { Browser } from 'playwright-chromium'
import { getTestInfo } from './getTestInfo'
import { Logs } from './Logs'
import { assert, assertUsage, humanizeTime, isTTY, logProgress } from './utils'
import { expect } from './chai/expect'
import { white, bgGreen, bgRed, bgYellow } from 'picocolors'

async function runTests(browser: Browser) {
  const testInfo = getTestInfo()

  if (isTTY) {
    console.log()
    console.log(testInfo.testFile)
  }

  const page = await browser.newPage()
  testInfo.page = page

  // Set when user calls `skip()`
  if (testInfo.skipped) {
    assertUsage(!testInfo.runWasCalled, 'You cannot call `run()` after calling `skip()`')
    assertUsage(testInfo.tests === undefined, 'You cannot call `test()` after calling `skip()`')
    logTestsResult(false)
    return
  }

  // Set when user calls `run()`
  assert(testInfo.runWasCalled)
  assert(testInfo.beforeAll)
  assert(testInfo.afterAll)
  assert(testInfo.afterEach)
  assert(testInfo.testTimeout)

  // Set when user calls `test()`
  assert(testInfo.tests)

  await testInfo.beforeAll()

  for (const { testDesc, testFn } of testInfo.tests) {
    const done = logProgress(` | [test] ${testDesc}`)
    let err: unknown
    try {
      await runTest(testFn, testInfo.testTimeout)
    } catch (err_) {
      err = err_
    }
    done(!!err)
    testInfo.afterEach(!!err)

    const browserErrors = Logs.getBrowserErrors()
    const isFailure = err || browserErrors.length > 0

    if (isFailure) {
      Logs.flush()
    }
    Logs.clear()

    if (isFailure) {
      logTestsResult(false)
      if (browserErrors.length === 0) {
        throw err
      } else {
        if (err) {
          console.error(err)
        }
        // Display all browser errors
        expect(browserErrors).deep.equal([])
        assert(false)
      }
    }
  }

  await testInfo.afterAll()
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
    reject(new Error(`[test][timeout after ${humanizeTime(testTimeout)}]`))
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
  const testInfo = getTestInfo()
  const passStyle = (t: string) => white(bgGreen(t))
  const failStyle = (t: string) => white(bgRed(t))
  const skipStyle = (t: string) => white(bgYellow(t))
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
