export { page }

import { assert } from './utils'
import { getCurrentTest } from './getCurrentTest'
import type { Page } from 'playwright-chromium'

const page = new Proxy({} as Page, {
  get(_, prop) {
    const { page } = getCurrentTest()
    assert(page)
    return page[prop as keyof Page]
  },
})
