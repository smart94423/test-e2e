export { findTestFiles }

import { findFiles, FindFilter } from './utils'
import { getTestFilesForCurrentJob } from './parallel-ci'

// Unit tests `**/*.spec.*` are handled by Vitest
const testFilenamePattern = '**/*.test.ts'

async function findTestFiles(findFilter: null | FindFilter): Promise<string[]> {
  {
    const testFiles = getTestFilesForCurrentJob()
    if (testFiles) return testFiles
  }
  {
    const testFiles = findFiles(testFilenamePattern, findFilter)
    return testFiles
  }
}
