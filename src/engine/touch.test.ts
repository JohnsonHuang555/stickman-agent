import { describe, expect, it } from 'vitest'
import { STICK_DEAD, STICK_UP_DEAD, mergeInput, stickButtons } from './touch'

describe('joystick directions', () => {
  it('small movements near the centre are ignored', () => {
    expect(stickButtons(STICK_DEAD - 1, 0)).toEqual([])
    expect(stickButtons(0, STICK_DEAD - 1)).toEqual([])
  })

  it('pushing left / right / down gives that direction', () => {
    expect(stickButtons(30, 0)).toEqual(['right'])
    expect(stickButtons(-30, 0)).toEqual(['left'])
    expect(stickButtons(0, 30)).toEqual(['down'])
  })

  it('pushing up (jump) needs a clear upward push', () => {
    expect(stickButtons(0, -(STICK_UP_DEAD - 1))).toEqual([])
    expect(stickButtons(0, -40)).toEqual(['up'])
  })

  it('pushing diagonally forward-and-up while walking does not jump by accident', () => {
    expect(stickButtons(40, -30)).toEqual(['right'])
  })

  it('a steep up-forward push is a jump toward that side', () => {
    expect(stickButtons(18, -40)).toEqual(['right', 'up'])
  })

  it('down-forward gives both (crouch while facing)', () => {
    expect(stickButtons(30, 30)).toEqual(['right', 'down'])
  })
})

describe('mergeInput', () => {
  it('combines keyboard and touch presses and held buttons', () => {
    const merged = mergeInput(
      { held: new Set(['left']), pressed: ['punch'] },
      { held: new Set(['kick']), pressed: ['kick'] },
    )
    expect([...merged.held].sort()).toEqual(['kick', 'left'])
    expect(merged.pressed).toEqual(['punch', 'kick'])
  })

  it('without touch controls it is just the keyboard', () => {
    const kb = { held: new Set<'left'>(['left']), pressed: [] }
    expect(mergeInput(kb, null)).toBe(kb)
  })
})
