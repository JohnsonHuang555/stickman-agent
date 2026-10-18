import { afterEach, describe, expect, it, vi } from 'vitest'
import { Grunt } from './enemies/grunt'
import type { Button } from './input/buttons'
import { newItem } from './items/itemTypes'
import { CRATE_HITS, Crate, rollCrateLoot } from './level/crate'
import { FLOORS } from './level/floors'
import { World } from './world'

function tick(world: World, pressed: Button[] = [], held: Button[] = []) {
  world.update({ pressed, held: new Set([...held, ...pressed]) })
}

function run(world: World, frames: number, held: Button[] = []) {
  for (let i = 0; i < frames; i++) tick(world, [], held)
}

function sandbox() {
  const world = new World({ mode: 'sandbox' })
  world.agent.x = 300
  return world
}

/** 出一拳並等它收招。 */
function punch(world: World) {
  tick(world, ['punch'])
  run(world, 20)
}

afterEach(() => vi.restoreAllMocks())

describe('crate loot table', () => {
  it('half medkits, then weapons, then score items', () => {
    expect(rollCrateLoot(() => 0.1)).toBe('medkit')
    expect(['bat', 'crowbar', 'knife', 'pistol']).toContain(rollCrateLoot(() => 0.6))
    expect(['cash', 'gold']).toContain(rollCrateLoot(() => 0.9))
  })
})

describe('crates', () => {
  it(`take ${CRATE_HITS} hits to break and drop their loot`, () => {
    const world = sandbox()
    world.crates = [new Crate(316, 'bat')]
    punch(world)
    expect(world.crates).toHaveLength(1)
    punch(world)
    expect(world.crates).toHaveLength(0)
    run(world, 40)
    expect(world.items.map((i) => i.item.type)).toContain('bat')
  })

  it('bullets and thrown items break them too', () => {
    const world = sandbox()
    world.crates = [new Crate(450, 'cash')]
    world.agent.held = newItem('pistol')
    punch(world)
    run(world, 30)
    punch(world)
    run(world, 30)
    expect(world.crates).toHaveLength(0)
  })

  it('enemies cannot break them', () => {
    const world = sandbox()
    world.crates = [new Crate(316)]
    world.agent.x = 290
    world.enemies = [new Grunt(330, 'thug', { moves: ['kick'] })]
    run(world, 600)
    expect(world.crates).toHaveLength(1)
  })

  it('every floor has crates, with a guaranteed medkit before each boss', () => {
    for (const floor of FLOORS) {
      expect(floor.crates.length).toBeGreaterThan(0)
      expect(floor.crates.some(([, loot]) => loot === 'medkit')).toBe(true)
    }
  })
})

describe('medkits and score items', () => {
  it('with the bag full, walking onto a medkit heals 40%, spilling over into the previous bar', () => {
    const world = sandbox()
    world.agent.bag = newItem('pistol') // 背包滿了才會直接補血
    world.agent.life.damage(world.agent.life.max - 70)
    world.placeItem('medkit', 340)
    run(world, 40, ['right'])
    expect(world.agent.life.hp).toBe(110)
    expect(world.agent.life.barsRemaining).toBe(2)
    expect(world.items).toHaveLength(0)
  })

  it('a medkit is picked up even while holding a weapon, and the weapon stays in hand', () => {
    const world = sandbox()
    world.agent.held = newItem('bat')
    world.agent.bag = newItem('pistol')
    world.agent.life.damage(50)
    world.placeItem('medkit', 300)
    tick(world)
    expect(world.agent.life.hp).toBe(world.agent.life.max - 10)
    expect(world.agent.held?.type).toBe('bat')
  })

  it('c does not pick up a medkit into your hands', () => {
    const world = sandbox()
    world.agent.life.damage(50)
    world.placeItem('medkit', 300)
    world.agent.h = 30 // 在空中時不會自動撿
    world.agent.vh = 0.1
    tick(world, ['grab'])
    expect(world.agent.held).toBeNull()
  })

  it('with the bag full and at full life, a medkit stays on the floor for later', () => {
    const world = sandbox()
    world.agent.bag = newItem('pistol')
    world.placeItem('medkit', 300)
    tick(world)
    expect(world.items).toHaveLength(1)
  })

  it('cash and gold add to the score', () => {
    const world = sandbox()
    world.placeItem('cash', 300)
    world.placeItem('gold', 330)
    run(world, 30, ['right'])
    expect(world.score).toBe(1500)
  })

  it('picking something up shows a popup', () => {
    const world = sandbox()
    world.placeItem('cash', 300)
    tick(world)
    expect(world.popups.map((p) => p.text)).toEqual(['+500'])
  })
})

describe('enemy drops', () => {
  it('a defeated grunt sometimes drops a medkit', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.05)
    const world = sandbox()
    const grunt = new Grunt(314, 'thug', { passive: true })
    world.enemies = [grunt]
    grunt.life.damage(grunt.life.hp - 1)
    punch(world)
    run(world, 40)
    // 掉出來的醫療箱可能已經被收進背包
    expect(world.items.some((i) => i.item.type === 'medkit') || world.agent.bag?.type === 'medkit').toBe(true)
  })

  it('but usually does not', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const world = sandbox()
    const grunt = new Grunt(314, 'thug', { passive: true })
    world.enemies = [grunt]
    grunt.life.damage(grunt.life.hp - 1)
    punch(world)
    run(world, 40)
    expect(world.items.some((i) => i.item.type === 'medkit')).toBe(false)
  })
})
