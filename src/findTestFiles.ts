export { findTestFiles }

import path from 'path'
import { assert, findFiles, FindFilter } from './utils'
import fs from 'fs'

const cwd = process.cwd()
// Unit tests `**/*.spec.*` are handled by Vitesse
const testFilenamePattern = '**/*.test.ts'

async function findTestFiles(findFilter: null | FindFilter): Promise<string[]> {
  if (process.env.TEST_FILES) {
    const testFiles = process.env.TEST_FILES.split(' ').map((filePathRelative) => path.join(cwd, filePathRelative))
    testFiles.forEach((testFile) => {
      assert(fs.existsSync(testFile), testFile)
    })
    return testFiles
  } else {
    const testFiles = findFiles(testFilenamePattern, findFilter)
    return testFiles
  }
}
