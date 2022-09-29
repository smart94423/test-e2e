export { runTestSuites }

import { assert, cliConfig, FindFilter } from './utils'
import fs from 'fs'
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
    await buildTs(testFile, testFileJs)
    setCurrentTest(testFile)
    try {
      await import(workaroundBug(testFileJs))
    } finally {
      if (!cliConfig.debugEsbuild) {
        fs.unlinkSync(`${testFileJs}`)
        fs.unlinkSync(`${testFileJs}.map`)
      }
    }
    await runTests(browser)
    setCurrentTest(null)
    assert(testFileJs.endsWith('.mjs'))
  }

  await browser.close()
}

// https://stackoverflow.com/questions/69665780/error-err-unsupported-esm-url-scheme-only-file-and-data-urls-are-supported-by/70057245#70057245
function workaroundBug(testFileJs: string): string {
  return `file://${testFileJs}`
}
