import glob from 'fast-glob'
import esbuild from 'esbuild'
import path from 'path'
import assert from 'assert'

const cwd = process.cwd()

cli()

async function cli() {
  const testFiles = (await glob(
    ['**/*.test.ts'], // Unit tests `**/*.spec.*` are handled by Vitesse
    { ignore: ['**/node_modules/**', '**/.git/**'], cwd, dot: true }
  )).map(filePathRelative => path.join(cwd, filePathRelative)).slice(3, 4)

  for(const filePath of testFiles) {
    assert(filePath.endsWith('.ts'))
    const filePathJs = filePath.replace('.ts', '.mjs')
    console.log(filePath)
    await buildTs(filePath, filePathJs)
    console.log(filePathJs)
    await import(filePathJs)
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
    minify: false,
  })
}
