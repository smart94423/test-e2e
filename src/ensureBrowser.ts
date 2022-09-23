export { ensureBrowser }

import { Browser, chromium } from 'playwright-chromium'

let browser: Browser | undefined
async function ensureBrowser() {
  if (!browser) {
    browser = await chromium.launch({ headless: true })
  }
  return browser
}
