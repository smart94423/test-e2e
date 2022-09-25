export { findTestFiles }
export type { Filter }

import glob from 'fast-glob'
import path from 'path'
import { assert } from './utils'
import fs from 'fs'

type Filter = {
  terms: string[]
  exclude: boolean
}

async function findTestFiles(filter: null | Filter): Promise<string[]> {
  const cwd = process.cwd()

  if (process.env.TEST_FILES) {
    const testFiles = process.env.TEST_FILES.split(' ').map((filePathRelative) => path.join(cwd, filePathRelative))
    testFiles.forEach((testFile) => {
      assert(fs.existsSync(testFile), testFile)
    })
    return testFiles
  }

  const testFiles = (
    await glob(
      ['**/*.test.ts'], // Unit tests `**/*.spec.*` are handled by Vitesse
      { ignore: ['**/node_modules/**', '**/.git/**'], cwd, dot: true },
    )
  )
    .filter((filePathRelative) => applyFilter(filePathRelative, filter))
    .map((filePathRelative) => path.join(cwd, filePathRelative))

  return testFiles
}

function applyFilter(filePathRelative: string, filter: null | Filter) {
  if (!filter) {
    return true
  }
  const { terms, exclude } = filter
  for (const term of terms) {
    if (!filePathRelative.includes(term) && !exclude) {
      return false
    }
    if (filePathRelative.includes(term) && exclude) {
      return false
    }
  }
  return true
}
