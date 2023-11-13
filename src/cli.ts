/* Track down log origins
import './utils/trackLogs'
//*/

import { findFilesParseCliArgs } from './utils'
import { runAll } from './runAll'
import { Logs } from './Logs'

initPromiseRejectionHandler()
initUserExitHandler()
cli()

function cli() {
  const filter = findFilesParseCliArgs()
  runAll(filter)
}

function initPromiseRejectionHandler() {
  process.on('unhandledRejection', function (err) {
    console.error(err)
    process.exit(1)
  })
}

function initUserExitHandler() {
  process.on('SIGINT', function () {
    Logs.flushLogs()
  })
}
