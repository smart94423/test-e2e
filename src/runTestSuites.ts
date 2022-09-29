export { runTestSuites }

import { assert, FindFilter, fsWindowsBugWorkaround } from './utils'
import { setCurrentTest } from './getCurrentTest'
import { runTests } from './runTests'

import { getBrowser } from './getBrowser'
import { buildTs } from './buildTs'
import { findTestFiles } from './findTestFiles'

async function runTestSuites(filter: null | FindFilter) {
  const testFiles = await findTestFiles(filter)

  const browser = await getBrowser()

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
    await runTests(browser)
    setCurrentTest(null)
    assert(testFileJs.endsWith('.mjs'))
  }

  await browser.close()
}
