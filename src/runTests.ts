export { runTests }

import assert from 'assert'
import { getTestInfo } from './getTestInfo'
import { getBrowser } from './getBrowser'
import { logProgress } from './logProgress'

async function runTests() {
  const testInfo = getTestInfo()

  //*
  const browser = await getBrowser()
  const page = await browser.newPage()
  testInfo.page = page
  //*/

  // Set by `test()`
  assert(testInfo.tests)

  // Set by `run()`
  assert(testInfo.beforeAll)
  assert(testInfo.afterAll)
  assert(testInfo.afterEach)

  /*
  assert(testInfo.testRun)
  await testInfo.testRun()
  */

  await testInfo.beforeAll()

  for (const { testDesc, testFn } of testInfo.tests) {
    const done = logProgress(`RUN: ${testDesc}`)
    try {
      await testFn()
    } catch (err) {
      done(true)
      console.log(`ERROR: ${testInfo.testFile} "${testDesc}"`)
      throw err
    }
    done()
    await testInfo.afterEach()
  }

  await testInfo.afterAll()
  await browser.close()
}
