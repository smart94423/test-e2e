export { buildTs }

import esbuild from 'esbuild'
import fs from 'fs'
import { cliOptions } from './utils'

async function buildTs(entry: string, outfile: string): Promise<() => void> {
  await esbuild.build({
    platform: 'node',
    entryPoints: [entry],
    sourcemap: 'inline',
    outfile,
    logLevel: 'warning',
    format: 'esm',
    target: 'es2022',
    bundle: true,
    packages: 'external',
    minify: false,
  })
  const removeBuildFile = () => {
    if (cliOptions.debugEsbuild) {
      return
    }
    fs.unlinkSync(`${outfile}`)
  }
  return removeBuildFile
}
