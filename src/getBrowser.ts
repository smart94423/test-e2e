export { getBrowser }

import { Browser, chromium } from 'playwright-chromium'
import { Logs } from './Logs'
import { assert, logProgress } from './utils'

let browser: Browser | undefined
async function getBrowser() {
  if (!browser) {
    const done = logProgress('Launch Browser')
    browser = await chromium.launch({
      headless: true,
      logger: {
        isEnabled: () => true,
        log: (name, _severity, message, args, _hint, ...rest) => {
          assert(args.length === 0)
          assert(rest.length === 0)
          Logs.add({
            logSource: 'Playwright',
            logText: `${name} ${message}`,
          })
        },
      },
    })
    done()
  }
  return browser
}
