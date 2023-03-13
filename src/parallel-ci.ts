export { abortIfParallelCI }
export { getTestFilesForCurrentJob }

import { assert } from './utils'
import fs from 'fs'
import path from 'path'

const cwd = process.cwd()

function abortIfParallelCI() {
  if (isParallelCI()) {
    process.exit(1)
  }
}
function isParallelCI(): boolean {
  return getTestFilesForCurrentJob() !== null
}

function getTestFilesForCurrentJob(): null | string[] {
  if (!('TEST_FILES' in process.env)) return null
  assert(process.env.TEST_FILES)
  const testFiles = process.env.TEST_FILES.split(' ').map((filePathRelative) => path.join(cwd, filePathRelative))
  testFiles.forEach((testFile) => {
    assert(fs.existsSync(testFile), testFile)
  })
  return testFiles
}
