import { isWindows, isLinux, isCI } from './utils/platform'
export const TIMEOUT_NPM_SCRIPT = 2 * 60 * 1000 * (!isCI() ? 1 : isWindows() ? 2 : 1)
export const TIMEOUT_TEST_FUNCTION = 60 * 1000 * (!isCI() ? 1 : isWindows() ? 5 : 3)
export const TIMEOUT_PROCESS_TERMINATION = 10 * 1000 * (!isCI() ? 1 : isWindows() ? 3 : !isLinux() ? 3 : 1)
export const TIMEOUT_AUTORETRY = TIMEOUT_TEST_FUNCTION / 2
export const TIMEOUT_PLAYWRIGHT = TIMEOUT_TEST_FUNCTION / 2
