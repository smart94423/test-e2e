import sourceMapSupport from 'source-map-support'
import { findFilesParseCliArgs, fsWindowsBugWorkaroundPrefix } from './utils'
import { runTestSuites } from './runTestSuites'
import { sourceMaps } from './buildTs'

initSourceMap()
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

function initSourceMap() {
  sourceMapSupport.install({
    retrieveSourceMap: function (source) {
      const prefix = fsWindowsBugWorkaroundPrefix
      if (source.startsWith(prefix)) {
        source = source.slice(prefix.length)
      }
      let sourceMap = sourceMaps[source]
      if (sourceMap) {
        return {
          map: sourceMap,
        }
      }
      return null
    },
  })
}
