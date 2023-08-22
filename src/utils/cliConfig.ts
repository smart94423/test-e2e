export { cliConfig }

const options = process.argv.filter((w) => w.startsWith('--'))

const INSPECT = '--inspect'
let inspect = false
if (includes(options, INSPECT)) {
  inspect = true
}

const DEBUG_ESBUILD = '--debug-esbuild'
let debugEsbuild = false
if (includes(options, DEBUG_ESBUILD)) {
  debugEsbuild = true
}

if (options.length > 0) {
  throw new Error(
    [
      // prettier-ignore
      `unknown options: ${options.join(' ')}`,
      `known options: ${[INSPECT, DEBUG_ESBUILD].join(' ')}`,
    ].join('\n')
  )
}

const cliConfig = {
  // To inspect a specific test: `$ touch examples/some-example/INSPECT`
  inspect: inspect || !!process.env.TEST_INSPECT,
  debugEsbuild,
}

function includes(list: string[], str: string) {
  const val = list.includes(str)
  if (val) list = list.filter((s) => s !== str)
  return val
}
