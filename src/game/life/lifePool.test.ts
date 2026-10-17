import { describe, expect, it } from 'vitest'
import { LifePool } from './lifePool'

describe('LifePool', () => {
  it('starts full with every bar remaining', () => {
    const life = new LifePool(2)
    expect(life.hp).toBe(200)
    expect(life.barsRemaining).toBe(2)
    expect(life.currentBarFill).toBe(1)
  })

  it('moves to the next bar once the current one is emptied', () => {
    const life = new LifePool(2)
    life.damage(100)
    expect(life.barsRemaining).toBe(1)
    expect(life.currentBarFill).toBe(1)
    life.damage(30)
    expect(life.currentBarFill).toBeCloseTo(0.7)
  })

  it('heals across bars: 70% on the last bar + 40% fills it and adds 10% back to the previous bar', () => {
    const life = new LifePool(2)
    life.damage(130)
    life.heal(40)
    expect(life.barsRemaining).toBe(2)
    expect(life.currentBarFill).toBeCloseTo(0.1)
  })

  it('never heals above max', () => {
    const life = new LifePool(2)
    life.damage(10)
    life.heal(40)
    expect(life.hp).toBe(200)
  })

  it('clamps at zero and reports death', () => {
    const life = new LifePool(1, 60)
    life.damage(999)
    expect(life.hp).toBe(0)
    expect(life.isDead).toBe(true)
    expect(life.barsRemaining).toBe(0)
    expect(life.currentBarFill).toBe(0)
  })

  it('does not revive the dead', () => {
    const life = new LifePool(1)
    life.damage(100)
    life.heal(40)
    expect(life.isDead).toBe(true)
  })

  it('supports non-100 bar sizes', () => {
    const life = new LifePool(3, 80)
    life.damage(100)
    expect(life.barsRemaining).toBe(2)
    expect(life.currentBarFill).toBeCloseTo(60 / 80)
  })
})
