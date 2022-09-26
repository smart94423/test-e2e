export { getBrowser }

import { Browser, chromium } from 'playwright-chromium'
import { logProgress } from './utils'

let browser: Browser | undefined
async function getBrowser() {
  if (!browser) {
    const done = logProgress('Launch Browser')
    browser = await chromium.launch({ headless: true })
    done()
  }
  return browser
}
