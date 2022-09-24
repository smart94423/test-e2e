import glob from 'fast-glob'
import esbuild from 'esbuild'
import path from 'path'
import assert from 'assert'
import { setTestInfo } from './getTestInfo'
import { runTests } from './runTests'

const cwd = process.cwd()

cli()

async function cli() {
  const testFiles = (
    await glob(
      ['**/*.test.ts'], // Unit tests `**/*.spec.*` are handled by Vitesse
      { ignore: ['**/node_modules/**', '**/.git/**'], cwd, dot: true }
    )
  )
    .map((filePathRelative) => path.join(cwd, filePathRelative))
    .slice(3, 4)

  for (const testFile of testFiles) {
    assert(testFile.endsWith('.ts'))
    const testFileJs = testFile.replace('.ts', '.mjs')
    console.log(testFile)
    await buildTs(testFile, testFileJs)
    console.log(testFileJs)
    setTestInfo({ testFile })
    import(testFileJs)
    await runTests()
    setTestInfo(null)
  }
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
    minify: false
  })
}
