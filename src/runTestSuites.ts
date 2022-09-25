export { runTestSuites }
export type { Filter }

import glob from 'fast-glob'
import esbuild from 'esbuild'
import path from 'path'
import { assert } from './utils'
import fs from 'fs'
import { setTestInfo } from './getTestInfo'
import { runTests } from './runTests'

import { getBrowser } from './getBrowser'

type Filter = {
  terms: string[]
  exclude: boolean
}

async function runTestSuites({ filter, debug }: { filter: null | Filter; debug: boolean }) {
  const testFiles = await findTestFiles(filter)

  const browser = await getBrowser()

  for (const testFile of testFiles) {
    assert(testFile.endsWith('.ts'))
    const testFileJs = testFile.replace('.ts', '.mjs')
    await buildTs(testFile, testFileJs)
    setTestInfo({ testFile })
    /*
    const exports = await import(testFileJs)
    assert(Object.keys(exports).length===1)
    const { testRun } = exports
    assert(testRun)
    setTestInfo({ testFile, testRun })
    */
    try {
      await import(testFileJs)
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

async function buildTs(entry: string, outfile: string) {
  await esbuild.build({
    platform: 'node',
    entryPoints: [entry],
    sourcemap: true,
    outfile,
    logLevel: 'warning',
    format: 'esm',
    target: 'es2020',
    bundle: true,
    external: ['./node_modules/*'],
    minify: false,
  })
}
