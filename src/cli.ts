import sourceMapSupport from 'source-map-support'
import { assert, findFilesParseCliArgs, fsWindowsBugWorkaroundPrefix } from './utils'
import { runTestSuites } from './runTestSuites'
import { sourceMaps } from './buildTs'
import { Logs } from './Logs'

initSourceMap()
initPromiseRejectionHandler()
initUserExitHandler()
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

function initUserExitHandler() {
  process.on('SIGINT', function () {
    Logs.flushLogs()
  })
}

function initSourceMap() {
  sourceMapSupport.install({
    retrieveSourceMap: function (source) {
      const prefix = fsWindowsBugWorkaroundPrefix
      if (source.startsWith(prefix)) {
        source = source.slice(prefix.length)
        if (process.platform == 'win32') {
          assert(source.startsWith('/'))
          source = source.slice(1)
          source = source.split('/').join('\\')
        }
      }
      let sourceMap = sourceMaps[source]
      if (sourceMap) {
        return {
          map: sourceMap,
        }
      }
      assert(!source.endsWith('.test.mjs'), { source, sourceMapsKeys: Object.keys(sourceMaps) })
      return null
    },
  })
}
