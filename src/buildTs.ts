export { buildTs }

import esbuild from 'esbuild'
import fs from 'fs'
import { cliConfig } from './utils'

async function buildTs(entry: string, outfile: string): Promise<() => void> {
  await esbuild.build({
    platform: 'node',
    entryPoints: [entry],
    sourcemap: true,
    outfile,
    logLevel: 'warning',
    format: 'esm',
    target: 'es2020',
    bundle: true,
    external: ['./node_modules/*', '@brillout/test-e2e'],
    minify: false,
  })
  const clean = () => {
    if (cliConfig.debugEsbuild) {
      return
    }
    fs.unlinkSync(`${outfile}`)
    fs.unlinkSync(`${outfile}.map`)
  }
  return clean
}
