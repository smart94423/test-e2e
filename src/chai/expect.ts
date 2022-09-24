import { JestChaiExpect } from './JestChaiExpect'
import * as chai from 'chai'
import type { Expect } from './types'

chai.use(JestChaiExpect)
export const expect = chai.expect as any as Expect
