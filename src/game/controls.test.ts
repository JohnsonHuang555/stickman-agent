import { describe, expect, it } from 'vitest'
import { KEYMAP, type Button } from './input/buttons'
import { LAUNCH_WAIT } from './input/commands'
import { Grunt } from './enemies/grunt'
import { World } from './world'

function tick(world: World, pressed: Button[] = [], held: Button[] = []) {
  world.update({ pressed, held: new Set([...held, ...pressed]) })
}

function sandbox() {
  const world = new World({ mode: 'sandbox' })
  world.items = []
  world.enemies = []
  world.agent.x = 300
  for (let i = 0; i < 5; i++) tick(world)
  return world
}

/** 從現在起第幾幀離地（沒離地回傳 -1）。 */
function framesUntilAirborne(world: World, frames = 30): number {
  for (let i = 0; i < frames; i++) {
    if (world.agent.h > 0) return i
    tick(world)
  }
  return -1
}

describe('keyboard layout (WASD + J K L, Left Shift)', () => {
  it('WASD moves, W is up/jump, J punch, K kick, L grab, Shift dodge; arrows still move', () => {
    expect(KEYMAP.KeyA).toBe('left')
    expect(KEYMAP.KeyD).toBe('right')
    expect(KEYMAP.KeyW).toBe('up')
    expect(KEYMAP.KeyS).toBe('down')
    expect(KEYMAP.KeyJ).toBe('punch')
    expect(KEYMAP.KeyK).toBe('kick')
    expect(KEYMAP.KeyL).toBe('grab')
    expect(KEYMAP.ShiftLeft).toBe('dodge')
    expect(KEYMAP.ArrowUp).toBe('up')
  })

  it('the space bar and the old Z / X / C keys do nothing any more', () => {
    for (const code of ['Space', 'KeyZ', 'KeyX', 'KeyC']) expect(KEYMAP[code]).toBeUndefined()
  })
})

describe('jumping with W (up)', () => {
  it('pressing up jumps right away', () => {
    const world = sandbox()
    tick(world, ['up'])
    expect(framesUntilAirborne(world)).toBeLessThanOrEqual(1)
  })

  it('a quick S → W without J still jumps, just LAUNCH_WAIT frames later (waiting to see if it was the launcher)', () => {
    const world = sandbox()
    tick(world, ['down'])
    tick(world, ['up'])
    const wait = framesUntilAirborne(world)
    expect(wait).toBeGreaterThan(0)
    expect(wait).toBeLessThanOrEqual(LAUNCH_WAIT + 1)
  })

  it('crouching first (holding S) and then pressing W jumps immediately', () => {
    const world = sandbox()
    tick(world, ['down'])
    for (let i = 0; i < 20; i++) tick(world, [], ['down'])
    tick(world, ['up'])
    expect(framesUntilAirborne(world)).toBeLessThanOrEqual(1)
  })

  it('S → W + J is the launcher, not a jump', () => {
    const world = sandbox()
    tick(world, ['down'])
    tick(world, ['up'])
    tick(world, ['punch'])
    expect(framesUntilAirborne(world, 20)).toBe(-1)
  })
})

describe('launcher input is forgiving (regression for "the launcher is too hard to pull off")', () => {
  /** S，等 g1 幀按 W，再等 g2 幀按 J；holdDown = 按 J 時 S 還沒放開。回傳雜兵有沒有被打上空中。 */
  function tryLaunch(g1: number, g2: number, holdDown: boolean): boolean {
    const world = new World({ mode: 'sandbox' })
    world.items = []
    world.agent.x = 300
    const g = new Grunt(320, 'thug', { passive: true })
    g.life.hp = 999
    world.enemies = [g]
    for (let i = 0; i < 5; i++) tick(world)
    const down = (f: number): Button[] => ((holdDown ? f < g1 + g2 + 2 : f < 3) ? ['down'] : [])
    let f = 0
    tick(world, ['down'])
    f++
    for (let i = 1; i < g1; i++, f++) tick(world, [], down(f))
    tick(world, ['up'], down(f))
    f++
    for (let i = 1; i < g2; i++, f++) tick(world, [], down(f))
    tick(world, ['punch'], down(f))
    for (let i = 0; i < 30; i++) {
      tick(world)
      if (g.juggled) return true
    }
    return false
  }

  it.each([
    [4, 4],
    [8, 8],
    [14, 6],
    [6, 12],
  ])('S →(%i frames)→ W →(%i frames)→ J launches, whether or not S is still held', (g1, g2) => {
    expect(tryLaunch(g1, g2, false)).toBe(true)
    expect(tryLaunch(g1, g2, true)).toBe(true)
  })
})
