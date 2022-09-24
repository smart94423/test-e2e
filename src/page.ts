export { page }

import assert from 'assert'
import { getTestInfo } from './getTestInfo'
import type { Page } from 'playwright-chromium'

const page = new Proxy({} as Page, {
  get(_, prop) {
    const { page } = getTestInfo()
    assert(page)
    return page[prop as keyof Page]
  },
})
