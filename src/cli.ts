// @ts-ignore
import 'source-map-support/register'
import { Filter, runTestSuites } from './runTestSuites'

cli()

function cli() {
  const { filter, debug } = parseArgs()
  runTestSuites({ filter, debug })
}

function parseArgs(): { filter: null | Filter; debug: boolean } {
  let debug = false
  const terms: string[] = []
  let exclude = false
  process.argv.slice(2).forEach((arg) => {
    if (arg === '--debug') {
      debug = true
    } else if (arg === '--exclude') {
      exclude = true
    } else {
      terms.push(arg)
    }
  })

  const filter =
    terms.length === 0
      ? null
      : {
          terms,
          exclude,
        }
  return {
    filter,
    debug,
  }
}
