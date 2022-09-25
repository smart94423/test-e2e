export { runTests }

import type { Browser } from 'playwright-chromium'
import { getTestInfo } from './getTestInfo'
import { logProgress } from './logProgress'
import { assert, assertUsage } from './utils'

const iconWarning = '⚠️'

async function runTests(browser: Browser) {
  const testInfo = getTestInfo()

  console.log()
  console.log(testInfo.testFile)

  const page = await browser.newPage()
  testInfo.page = page

  // Set when user calls `skip()`
  if (testInfo.skipped) {
    assertUsage(!testInfo.runWasCalled, 'You cannot call `run()` after calling `skip()`')
    assertUsage(testInfo.tests === undefined, 'You cannot call `test()` after calling `skip()`')
    console.log(` | ${iconWarning} SKIPPED: ${testInfo.skipped}`)
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
    const done = logProgress(`[test] ${testDesc}`)
    let err: unknown
    try {
      await runTest(testFn, testInfo.testTimeout)
    } catch (err_) {
      err = err_
    }
    done(!!err)
    await testInfo.afterEach(err)
  }

  await testInfo.afterAll()
  await page.close()
}

function runTest(testFn: Function, testTimeout: number): Promise<undefined | unknown> {
  let resolve!: () => void
  let reject!: (err: unknown) => void
  const promise = new Promise<void>((resolve_, reject_) => {
    resolve = resolve_
    reject = reject_
  })

  const timeout = setTimeout(() => {
    reject(new Error(`[test][timeout after ${testTimeout / 1000} seconds]`))
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
