/* Track down log origins
import './utils/trackLogs'
//*/

import sourceMapSupport from 'source-map-support'
import { assert, findFilesParseCliArgs, fsWindowsBugWorkaroundPrefix } from './utils'
import { runAll } from './runAll'
import { sourceMaps } from './buildTs'
import { Logs } from './Logs'

initSourceMap()
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

// Much simpler alternative: https://github.com/brillout/vite-plugin-ssr/blob/77b1b0e8b6c1ed4efe3e3039f7c0b23a00651663/vite-plugin-ssr/node/plugin/plugins/importUserCode/v1-design/transpileAndLoadFile.ts#L200-L208
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
