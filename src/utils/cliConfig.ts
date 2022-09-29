const cliArgs = process.argv.slice(2)
export const cliConfig = {
  debugEsbuild: cliArgs.includes('--debug-esbuild'),
  debug: cliArgs.includes('--debug')
}
