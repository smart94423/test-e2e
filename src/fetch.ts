export { fetch }
export { fetchHtml }

import { getServerUrl } from './getCurrentTest'
import fetch_ from 'node-fetch'
import { Logs } from './Logs'

async function fetchHtml(pathname: string) {
  const response = await fetch(getServerUrl() + pathname)
  const html = await response.text()
  return html
}
async function fetch(...args: Parameters<typeof fetch_>) {
  try {
    return await fetch_(...args)
  } catch (err) {
    Logs.add({
      logSource: 'Connection Error',
      logText: `Couldn't connect to \`${args[0]}\`. Args: \`${JSON.stringify(args.slice(1))}\`. Err: \`${
        // @ts-ignore
        err.message
      }\``,
    })
    throw new Error("Couldn't connect to server. See `Connection Error` log for more details.")
  }
}
