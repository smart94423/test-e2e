export { page }

import { getCurrentTest } from './getCurrentTest'
import type { Page } from 'playwright-chromium'

const page = new Proxy({} as Page, {
  get(_, prop) {
    const { page } = getCurrentTest()
    if (!page)
      throw new Error(
        "`page` isn't available. Make sure to access `page` only inside test() calls. In particular, if test() is async, then make sure to await all asynchronous code executed by your async test()."
      )
    return page[prop as keyof Page]
  },
})
