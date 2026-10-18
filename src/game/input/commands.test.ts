import { describe, expect, it } from 'vitest'
import type { Button, Press } from './buttons'
import { DOUBLE_TAP_WINDOW, SIMULTANEOUS_WINDOW, recognizeCommand } from './commands'

const press = (button: Button, frame: number): Press => ({ button, frame })

function recognize(
  presses: Press[],
  frame: number,
  opts: { airborne?: boolean; crouching?: boolean; launchReady?: boolean; down?: boolean; held?: Button[] } = {},
) {
  return recognizeCommand({
    frame,
    presses,
    airborne: opts.airborne ?? false,
    crouching: opts.crouching ?? false,
    launchReady: opts.launchReady,
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

  it('z + x + c on the same frame is the desperation move', () => {
    const presses = [press('punch', 10), press('kick', 10), press('grab', 10)]
    expect(recognize(presses, 10)?.kind).toBe('desperation')
  })

  it('z + x without c is just a kick (no more accidental desperation moves)', () => {
    expect(recognize([press('punch', 10), press('kick', 10)], 10)?.kind).toBe('kick')
  })

  it('the three keys pressed within the window, all still held, is the desperation move — whichever comes last', () => {
    const w = SIMULTANEOUS_WINDOW
    const held: Button[] = ['punch', 'kick', 'grab']
    expect(recognize([press('punch', 10), press('kick', 11), press('grab', 10 + w)], 10 + w, { held })?.kind).toBe('desperation')
    expect(recognize([press('grab', 10), press('punch', 11), press('kick', 10 + w)], 10 + w, { held })?.kind).toBe('desperation')
  })

  it('if one of the three was already released, it is not the desperation move', () => {
    const presses = [press('punch', 10), press('grab', 11), press('kick', 12)]
    expect(recognize(presses, 12, { held: ['grab', 'kick'] })?.kind).toBe('kick')
  })

  it('c alone is not an attack command (it is pick up / throw)', () => {
    expect(recognize([press('grab', 10)], 10)).toBeNull()
  })

  it('z then x outside the window is just a kick', () => {
    const presses = [press('punch', 10), press('kick', 11 + SIMULTANEOUS_WINDOW)]
    expect(recognize(presses, 11 + SIMULTANEOUS_WINDOW)?.kind).toBe('kick')
  })

  it('in the air, x is an air kick, ←/→ + x is a flying kick that way', () => {
    expect(recognize([press('kick', 10)], 10, { airborne: true })?.kind).toBe('airKick')
    expect(recognize([press('kick', 10)], 10, { airborne: true, held: ['right', 'kick'] })).toEqual({ kind: 'flyingKick', dir: 1 })
    expect(recognize([press('kick', 10)], 10, { airborne: true, held: ['left', 'kick'] })).toEqual({ kind: 'flyingKick', dir: -1 })
  })

  it('in the air, z is an air punch and down+z is a dive smash', () => {
    expect(recognize([press('punch', 10)], 10, { airborne: true })?.kind).toBe('airPunch')
    expect(recognize([press('punch', 10)], 10, { airborne: true, down: true })?.kind).toBe('diveSmash')
  })

  it('punch right after down → up (S → W) on the ground is the launcher', () => {
    expect(recognize([press('punch', 10)], 10, { launchReady: true })?.kind).toBe('launcher')
  })

  it('the desperation move still wins right after down → up', () => {
    const presses = [press('punch', 10), press('kick', 10), press('grab', 10)]
    expect(recognize(presses, 10, { launchReady: true })?.kind).toBe('desperation')
  })

  it('no desperation move in the air', () => {
    const presses = [press('punch', 10), press('kick', 10), press('grab', 10)]
    expect(recognize(presses, 10, { airborne: true })?.kind).toBe('airKick')
  })

  it('crouching z is a crouch punch, crouching x is a sweep', () => {
    expect(recognize([press('kick', 10)], 10, { crouching: true })?.kind).toBe('sweep')
    expect(recognize([press('punch', 10)], 10, { crouching: true })?.kind).toBe('crouchPunch')
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
