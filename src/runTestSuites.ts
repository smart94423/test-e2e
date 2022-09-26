export { runTestSuites }

import { assert } from './utils'
import fs from 'fs'
import { setTestInfo } from './getTestInfo'
import { runTests } from './runTests'

import { getBrowser } from './getBrowser'
import { buildTs } from './buildTs'
import { Filter, findTestFiles } from './findTestFiles'

async function runTestSuites({ filter, debug }: { filter: null | Filter; debug: boolean }) {
  const testFiles = await findTestFiles(filter)

  const browser = await getBrowser()

  for (const testFile of testFiles) {
    assert(testFile.endsWith('.ts'))
    const testFileJs = testFile.replace('.ts', '.mjs')
    await buildTs(testFile, testFileJs)
    setTestInfo({ testFile })
    try {
      await import(workaroundBug(testFileJs))
      await runTests(browser)
    } finally {
      if (!debug) {
        fs.unlinkSync(`${testFileJs}`)
        fs.unlinkSync(`${testFileJs}.map`)
      }
    }
    setTestInfo(null)
    assert(testFileJs.endsWith('.mjs'))
  }

  await browser.close()
}

// https://stackoverflow.com/questions/69665780/error-err-unsupported-esm-url-scheme-only-file-and-data-urls-are-supported-by/70057245#70057245
function workaroundBug(testFileJs: string): string {
  return `file://${testFileJs}`
}
