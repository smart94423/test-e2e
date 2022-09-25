export type { ChaiPlugin }
export type { Expect }

import type { use as chaiUse } from 'chai'
type FirstFunctionArgument<T> = T extends (arg: infer A) => unknown ? A : never
type ChaiPlugin = FirstFunctionArgument<typeof chaiUse>

type Assertion = Chai.Assertion & {
  not: Assertion
  toContain: Assertion['contain']
  toMatch: Assertion['match']
  toBe: Assertion['equal']
  toBeFalsy(): void
  toBeTruthy(): void
  toBee: Assertion['equal']
}

type Expect = (value: any) => Assertion
