const cliArgs = process.argv.slice(2)
export const cliConfig = {
  debugEsbuild: cliArgs.includes('--debug-esbuild'),
  // To inspect a specific test: `$ touch examples/some-example/INSPECT`
  inspect: cliArgs.includes('--inspect') || !!process.env.TEST_INSPECT,
}
