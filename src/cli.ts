// @ts-ignore
import 'source-map-support/register'
import { Filter, runTestSuites } from './runTestSuites'

cli()

function cli() {
  const { filter } = parseArgs()
  runTestSuites(filter)
}

function parseArgs(): { filter: null | Filter } {
  const args = process.argv.slice(2)
  if (args.length === 0) {
    return { filter: null }
  }
  const terms: string[] = []
  let exclude = false
  args.forEach((arg) => {
    if (arg.startsWith('--exclude')) {
      exclude = true
    } else {
      terms.push(arg)
    }
  })
  return {
    filter: {
      terms,
      exclude,
    },
  }
}
