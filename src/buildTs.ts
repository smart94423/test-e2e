export { buildTs }
export { sourceMaps }

import esbuild from 'esbuild'
import fs from 'fs'
import { cliOptions } from './utils'

const sourceMaps: Record<string, string> = {}

async function buildTs(entry: string, outfile: string): Promise<() => void> {
  await esbuild.build({
    platform: 'node',
    entryPoints: [entry],
    sourcemap: true,
    outfile,
    logLevel: 'warning',
    format: 'esm',
    target: 'es2022',
    bundle: true,
    packages: 'external',
    minify: false,
  })
  {
    const sourceMapFile = `${outfile}.map`
    sourceMaps[outfile] = fs.readFileSync(sourceMapFile, 'utf8')
    fs.unlinkSync(sourceMapFile)
  }
  const clean = () => {
    if (cliOptions.debugEsbuild) {
      return
    }
    fs.unlinkSync(`${outfile}`)
  }
  return clean
}
