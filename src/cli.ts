// @ts-ignore
import 'source-map-support/register'
import { findFilesParseCliArgs } from './utils'
import { runTestSuites } from './runTestSuites'

initPromiseRejectionHandler()
cli()

function cli() {
  const filter = findFilesParseCliArgs()
  runTestSuites(filter)
}

function initPromiseRejectionHandler() {
  process.on('unhandledRejection', function (err) {
    console.error(err)
    process.exit(1)
  })
}
