export { getConfig }
export { loadConfig }

import path from 'path'
import fs from 'fs'
import { assert, assertUsage, fsWindowsBugWorkaround, isCallable, isObject } from './utils'

const configFileName = 'test-e2e.config.mjs'

type Config = {
  tolerateError?: Function
  ci?: never
}

let config: null | Config = null

function getConfig(): Config {
  assert(config)
  return config
}

async function loadConfig(): Promise<void> {
  const configFilePath = find()
  assertUsage(configFilePath, `${configFileName} not found`)
  const configFileExports = (await import(fsWindowsBugWorkaround(configFilePath))) as Record<string, unknown>
  assertUsage('default' in configFileExports, `${configFileName} should have a default export`)
  assertConfig(configFileExports.default)
  config = configFileExports.default
}

function assertConfig(config: unknown): asserts config is Config {
  assertUsage(isObject(config), `${configFileName} default export should be an object`)
  Object.entries(config).forEach(([key, val]) => {
    const wrongType = `${configFileName} export default { ${key} } should be a` as const
    if (key === 'tolerateError') {
      assertUsage(isCallable(val), `${wrongType} function`)
    } else if (key === 'ci') {
      // Only used by .github/workflows/ci/getTestJobs.mjs
      // https://github.com/brillout/vite-plugin-ssr/blob/4fa329e4081655c39c4c70436ae73e563489439e/.github/workflows/ci/getTestJobs.mjs#L72
      return
    } else {
      assertUsage(false, `${configFileName} unknown config ${key}`)
    }
  })
}

function find(): null | string {
  let dir = process.cwd()
  while (true) {
    const configFilePath = path.join(dir, configFileName)
    if (fs.existsSync(configFilePath)) {
      return configFilePath
    }
    const dirPrevious = dir
    dir = path.dirname(dir)
    if (dir === dirPrevious) {
      return null
    }
  }
}
