export { cliOptions }

import { check, prepare, validate } from './parseCli'

prepare()
const verbose = check('--verbose')
const inspect = check('--inspect')
const debugEsbuild = check('--debug-esbuild')
const bail = check('--bail')
/* Defined in ./findFiles.ts
 * I don't think we use the --exclude option anymore? Can we remove it?
const exclude = check('--exclude')
*/
validate()

const cliOptions = {
  verbose,
  // To inspect a specific test: `$ touch examples/some-example/INSPECT`
  inspect: inspect || !!process.env.TEST_INSPECT,
  debugEsbuild,
  bail,
}
