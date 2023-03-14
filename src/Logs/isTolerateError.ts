export { isTolerateError }

import { getConfig } from '../getConfig'
import type { LogSource } from '../Logs'

type LogData = { logSource: LogSource; logText: string }

function isTolerateError({ logSource, logText }: LogData): boolean {
  if (tolerateError({ logSource, logText })) {
    return true
  }
  const config = getConfig()
  if (config.tolerateError?.({ logSource, logText })) {
    return true
  }
  return false
}

function tolerateError({ logSource, logText }: LogData): boolean {
  return isFetchExperimentalWarning() && isTerminationEPIPE()

  function isFetchExperimentalWarning() {
    return (
      logSource === 'stderr' &&
      logText.includes(
        'ExperimentalWarning: The Fetch API is an experimental feature. This feature could change at any time'
      )
    )
  }

  /* Suppress:
  ```
  [16:00:26.335][/examples/i18n-v1][npm run dev][run()] Terminate server.
  [16:00:26.342][/examples/i18n-v1][npm run dev][stderr] The service was stopped: write EPIPE
  [16:00:26.342][/examples/i18n-v1][npm run dev][run()] Process termination. (Nominal, exit code: null.)
  ```
  */
  function isTerminationEPIPE() {
    return logSource === 'stderr' && logText.includes('The service was stopped: write EPIPE')
  }
}
