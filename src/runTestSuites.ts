export { runTestSuites }
export type { Filter }

import glob from 'fast-glob'
import esbuild from 'esbuild'
import path from 'path'
import assert from 'assert'
import fs from 'fs'
import { setTestInfo } from './getTestInfo'
import { runTests } from './runTests'

const cwd = process.cwd()

import { getBrowser } from './getBrowser'

type Filter = {
  terms: string[]
  exclude: boolean
}

async function runTestSuites(filter: null | Filter) {
  const testFiles = (
    await glob(
      ['**/*.test.ts'], // Unit tests `**/*.spec.*` are handled by Vitesse
      { ignore: ['**/node_modules/**', '**/.git/**'], cwd, dot: true },
    )
  )
    .filter((filePathRelative) => {
      if (!filter) {
        return true
      }
      let include = true
      filter.terms.forEach((term) => {
        if (!filePathRelative.includes(term)) {
          include = false
        }
      })
      if (filter.exclude) {
        include = !include
      }
      return include
    })
    .map((filePathRelative) => path.join(cwd, filePathRelative))

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
      fs.unlinkSync(`${testFileJs}`)
      fs.unlinkSync(`${testFileJs}.map`)
    }
    setTestInfo(null)
    assert(testFileJs.endsWith('.mjs'))
  }

  await browser.close()
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
