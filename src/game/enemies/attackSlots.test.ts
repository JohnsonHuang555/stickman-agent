import { describe, expect, it } from 'vitest'
import { AttackSlots } from './attackSlots'

describe('AttackSlots', () => {
  it('grants up to capacity and refuses the rest', () => {
    const slots = new AttackSlots(2)
    expect(slots.request(1)).toBe(true)
    expect(slots.request(2)).toBe(true)
    expect(slots.request(3)).toBe(false)
    expect(slots.count).toBe(2)
  })

  it('re-requesting a held slot keeps it without using another', () => {
    const slots = new AttackSlots(2)
    slots.request(1)
    expect(slots.request(1)).toBe(true)
    expect(slots.count).toBe(1)
  })

  it('a released slot can be taken by someone else', () => {
    const slots = new AttackSlots(1)
    slots.request(1)
    slots.release(1)
    expect(slots.request(2)).toBe(true)
    expect(slots.has(1)).toBe(false)
  })

  it('releasing a slot you do not hold is harmless', () => {
    const slots = new AttackSlots(1)
    slots.request(1)
    slots.release(99)
    expect(slots.has(1)).toBe(true)
  })
})
