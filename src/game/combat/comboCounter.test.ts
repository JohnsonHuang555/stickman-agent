import { describe, expect, it } from 'vitest'
import { COMBO_TIMEOUT, ComboCounter, MAX_MULTIPLIER } from './comboCounter'

describe('ComboCounter', () => {
  it('counts consecutive hits', () => {
    const c = new ComboCounter()
    c.hit(0)
    c.hit(10)
    c.hit(20)
    expect(c.count).toBe(3)
  })

  it('resets when the next hit comes too late', () => {
    const c = new ComboCounter()
    c.hit(0)
    c.hit(COMBO_TIMEOUT + 1)
    expect(c.count).toBe(1)
  })

  it('drops to zero on update after the timeout', () => {
    const c = new ComboCounter()
    c.hit(0)
    c.update(COMBO_TIMEOUT)
    expect(c.count).toBe(1)
    c.update(COMBO_TIMEOUT + 1)
    expect(c.count).toBe(0)
  })

  it('breaks immediately when the agent is hit', () => {
    const c = new ComboCounter()
    c.hit(0)
    c.hit(1)
    c.break()
    expect(c.count).toBe(0)
  })

  it('raises the multiplier every 5 hits, capped', () => {
    const c = new ComboCounter()
    for (let i = 0; i < 4; i++) c.hit(i)
    expect(c.multiplier).toBe(1)
    c.hit(4)
    expect(c.multiplier).toBe(2)
    for (let i = 5; i < 60; i++) c.hit(i)
    expect(c.multiplier).toBe(MAX_MULTIPLIER)
  })

  it('gives a rating from 5 hits up and remembers the best combo', () => {
    const c = new ComboCounter()
    for (let i = 0; i < 4; i++) c.hit(i)
    expect(c.rating).toBeNull()
    c.hit(4)
    expect(c.rating).toBe('GOOD!')
    for (let i = 5; i < 10; i++) c.hit(i)
    expect(c.rating).toBe('GREAT!')
    c.break()
    expect(c.best).toBe(10)
  })
})
