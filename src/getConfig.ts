export { getConfig }
export { loadConfig }

import path from 'path'
import fs from 'fs'
import { assert, assertUsage, isCallable, isObject } from './utils'

const configFileName = 'test-e2e.config.mjs'
const errPrefix = `Config file \`${configFileName}\` `

type Config = {
  tolerateError?: Function
}

let config: null | Config = null

function getConfig(): Config {
  assert(config)
  return config
}

async function loadConfig(): Promise<void> {
  const configFilePath = find()
  assertUsage(configFilePath, errPrefix + 'not found')
  const configFileExports = (await import(configFilePath)) as Record<string, unknown>
  assertUsage('default' in configFileExports, errPrefix + 'should have a default export')
  assertConfig(configFileExports.default)
  config = configFileExports.default
}

function assertConfig(config: unknown): asserts config is Config {
  assertUsage(isObject(config), errPrefix + 'default export should be an object')
  if ('tolerateError' in config) {
    assertUsage(isCallable(config.tolerateError), errPrefix + '`tolerateError` should be a function')
  }
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
