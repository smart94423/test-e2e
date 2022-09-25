import type { ChaiPlugin } from './types'

// Copied from https://github.com/vitest-dev/vitest/blob/f3524602ccc678badaae6bc5c3945008d8cfd82a/packages/vitest/src/integrations/chai/jest-expect.ts

export const JestChaiExpect: ChaiPlugin = (chai, utils) => {
  function def(name: string, fn: (this: Chai.Assertion & Chai.AssertionStatic, ...args: any[]) => any) {
    utils.addMethod(chai.Assertion.prototype, name, fn)
  }

  def('toContain', function (item) {
    return this.contain(item)
  })
  def('toMatch', function (item) {
    return this.match(item)
  })
  def('toBe', function (item) {
    return this.equal(item)
  })

  def('toBeTruthy', function () {
    const obj = utils.flag(this, 'object')
    this.assert(Boolean(obj), 'expected #{this} to be truthy', 'expected #{this} to not be truthy', obj)
  })
  def('toBeFalsy', function () {
    const obj = utils.flag(this, 'object')
    this.assert(!obj, 'expected #{this} to be falsy', 'expected #{this} to not be falsy', obj)
  })
}
