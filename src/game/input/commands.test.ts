import { describe, expect, it } from 'vitest'
import type { Button, Press } from './buttons'
import { DOUBLE_TAP_WINDOW, SIMULTANEOUS_WINDOW, recognizeCommand } from './commands'

const press = (button: Button, frame: number): Press => ({ button, frame })

function recognize(
  presses: Press[],
  frame: number,
  opts: { airborne?: boolean; crouching?: boolean; up?: boolean; down?: boolean; held?: Button[] } = {},
) {
  return recognizeCommand({
    frame,
    presses,
    airborne: opts.airborne ?? false,
    crouching: opts.crouching ?? false,
    up: opts.up,
    down: opts.down,
    held: opts.held && new Set(opts.held),
  })
}

describe('recognizeCommand', () => {
  it('returns null when no attack button was pressed this frame', () => {
    expect(recognize([press('punch', 9)], 10)).toBeNull()
    expect(recognize([press('jump', 10)], 10)).toBeNull()
  })

  it('z alone is a punch, x alone is a kick', () => {
    expect(recognize([press('punch', 10)], 10)?.kind).toBe('punch')
    expect(recognize([press('kick', 10)], 10)?.kind).toBe('kick')
  })

  it('z + x on the same frame is the desperation move', () => {
    expect(recognize([press('punch', 10), press('kick', 10)], 10)?.kind).toBe('desperation')
  })

  it('z then x within the simultaneous window is still the desperation move', () => {
    const presses = [press('punch', 10), press('kick', 10 + SIMULTANEOUS_WINDOW)]
    expect(recognize(presses, 10 + SIMULTANEOUS_WINDOW)?.kind).toBe('desperation')
  })

  it('z then x while z is still held is the desperation move', () => {
    const presses = [press('punch', 10), press('kick', 12)]
    expect(recognize(presses, 12, { held: ['punch', 'kick'] })?.kind).toBe('desperation')
  })

  it('tapping z then x (z already released) is just a kick, even within the window', () => {
    const presses = [press('punch', 10), press('kick', 12)]
    expect(recognize(presses, 12, { held: ['kick'] })?.kind).toBe('kick')
  })

  it('z then x outside the window is just a kick', () => {
    const presses = [press('punch', 10), press('kick', 11 + SIMULTANEOUS_WINDOW)]
    expect(recognize(presses, 11 + SIMULTANEOUS_WINDOW)?.kind).toBe('kick')
  })

  it('in the air, x is a flying kick, z is an air punch, and down+z is a dive smash', () => {
    expect(recognize([press('kick', 10)], 10, { airborne: true })?.kind).toBe('flyingKick')
    expect(recognize([press('punch', 10)], 10, { airborne: true })?.kind).toBe('airPunch')
    expect(recognize([press('punch', 10)], 10, { airborne: true, down: true })?.kind).toBe('diveSmash')
  })

  it('up + z on the ground is the launcher', () => {
    expect(recognize([press('punch', 10)], 10, { up: true })?.kind).toBe('launcher')
  })

  it('up + z + x is still the desperation move', () => {
    expect(recognize([press('punch', 10), press('kick', 10)], 10, { up: true })?.kind).toBe('desperation')
  })

  it('no desperation move in the air', () => {
    expect(recognize([press('punch', 10), press('kick', 10)], 10, { airborne: true })?.kind).toBe('flyingKick')
  })

  it('crouching z is a sweep', () => {
    expect(recognize([press('punch', 10)], 10, { crouching: true })?.kind).toBe('sweep')
  })

  it('double-tap a direction then z is a dash punch in that direction', () => {
    const presses = [press('left', 0), press('left', 8), press('punch', 12)]
    expect(recognize(presses, 12)).toEqual({ kind: 'dashPunch', dir: -1 })
  })

  it('taps too far apart do not make a dash punch', () => {
    const presses = [press('right', 0), press('right', DOUBLE_TAP_WINDOW + 1), press('punch', DOUBLE_TAP_WINDOW + 2)]
    expect(recognize(presses, DOUBLE_TAP_WINDOW + 2)?.kind).toBe('punch')
  })

  it('a stale double tap does not make a dash punch', () => {
    const at = 6 + DOUBLE_TAP_WINDOW + 1
    expect(recognize([press('right', 0), press('right', 6), press('punch', at)], at)?.kind).toBe('punch')
  })

  it('uses the most recent double tap when both directions qualify', () => {
    const presses = [press('left', 0), press('left', 4), press('right', 6), press('right', 10), press('punch', 12)]
    expect(recognize(presses, 12)).toEqual({ kind: 'dashPunch', dir: 1 })
  })
})
