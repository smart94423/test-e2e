export { getBrowser }

import { Browser, chromium } from 'playwright-chromium'

let browser: Browser | undefined
async function getBrowser() {
  if (!browser) {
    browser = await chromium.launch({ headless: true })
  }
  return browser
}
