export { cliConfig }

import { check, prepare, validate } from './parseCli'

prepare()
const verbose = check('--verbose')
const inspect = check('--inspect')
const debugEsbuild = check('--debug-esbuild')
validate()

const cliConfig = {
  verbose,
  // To inspect a specific test: `$ touch examples/some-example/INSPECT`
  inspect: inspect || !!process.env.TEST_INSPECT,
  debugEsbuild,
}
