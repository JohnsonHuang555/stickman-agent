import { describe, expect, it } from 'vitest'
import type { HitSpec } from './combat/types'
import { Grunt, JUGGLE_LIMIT } from './enemies/grunt'
import type { Button } from './input/buttons'
import { newItem } from './items/itemTypes'
import { World } from './world'

function tick(world: World, pressed: Button[] = [], held: Button[] = []) {
  world.update({ pressed, held: new Set([...held, ...pressed]) })
}

function run(world: World, frames: number, held: Button[] = []) {
  for (let i = 0; i < frames; i++) tick(world, [], held)
}

/** 特務面前站一個不會動、血很多的雜兵。 */
function setup(type: 'thug' | 'heavy' = 'thug') {
  const world = new World({ mode: 'sandbox' })
  world.agent.x = 300
  const grunt = new Grunt(322, type, { passive: true })
  grunt.life.hp = 999
  world.enemies = [grunt]
  return { world, grunt, damage: () => 999 - grunt.life.hp }
}

const JAB: HitSpec = { from: 0, to: 0, box: { forward: 0, up: 0, w: 1, h: 1 }, damage: 1, hitstun: 10, knockback: 0.4 }
const LAUNCH: HitSpec = { ...JAB, launch: 7.6 }
const SPIKE: HitSpec = { ...JAB, spike: true, knockdown: true }

/** ↑+Z → 跳 → Z → Z → X，每步之間等對的幀數。 */
function fullCombo(world: World) {
  tick(world, ['punch'], ['up'])
  run(world, 7, ['up'])
  tick(world, ['jump'])
  run(world, 8)
  tick(world, ['punch'])
  run(world, 7)
  tick(world, ['punch'])
  run(world, 7)
  tick(world, ['kick'])
  run(world, 12)
}

describe('launcher', () => {
  it('↑+Z sends a grunt into the air', () => {
    const { world, grunt, damage } = setup()
    tick(world, ['punch'], ['up'])
    let maxH = 0
    for (let i = 0; i < 40; i++) {
      tick(world)
      maxH = Math.max(maxH, grunt.h)
    }
    expect(damage()).toBe(8)
    expect(maxH).toBeGreaterThan(40)
  })

  it('a plain Z does not launch', () => {
    const { world, grunt } = setup()
    tick(world, ['punch'])
    run(world, 30)
    expect(grunt.juggled).toBe(false)
    expect(grunt.h).toBe(0)
  })

  it('the full combo ↑Z → jump → Z Z X connects every hit and spikes the grunt into a bounce', () => {
    for (const type of ['thug', 'heavy'] as const) {
      const { world, grunt, damage } = setup(type)
      fullCombo(world)
      expect(damage()).toBe(8 + 5 + 6 + 10)
      let bounced = false
      for (let i = 0; i < 80; i++) {
        const before = grunt.h
        tick(world)
        if (before === 0 && grunt.h > 0) bounced = true
      }
      expect(bounced).toBe(true)
    }
  })
})

describe('juggle rules', () => {
  it(`a juggled grunt falls after ${JUGGLE_LIMIT} hits`, () => {
    const { world, grunt } = setup()
    grunt.receiveHit(LAUNCH, 1, world)
    for (let i = 1; i < JUGGLE_LIMIT - 1; i++) {
      grunt.receiveHit(JAB, 1, world)
      expect(grunt.hurtbox()).not.toBeNull()
    }
    grunt.receiveHit(JAB, 1, world)
    expect(grunt.juggled).toBe(false)
    expect(grunt.hurtbox()).toBeNull()
  })

  it('hits on a juggled grunt keep it up instead of knocking it down', () => {
    const { world, grunt } = setup()
    grunt.receiveHit(LAUNCH, 1, world)
    run(world, 10)
    grunt.receiveHit({ ...JAB, knockdown: true }, 1, world)
    expect(grunt.juggled).toBe(true)
  })

  it('a spike sends the grunt down; it bounces once, then stays down', () => {
    const { world, grunt } = setup()
    grunt.receiveHit(LAUNCH, 1, world)
    run(world, 10)
    grunt.receiveHit(SPIKE, 1, world)
    expect(grunt.vh).toBeLessThan(0)
    let landings = 0
    for (let i = 0; i < 80; i++) {
      const wasAir = grunt.h > 0
      tick(world)
      if (wasAir && grunt.h === 0) landings++
    }
    expect(landings).toBe(2)
  })

  it('a launched grunt drops its weapon', () => {
    const { world, grunt } = setup()
    grunt.held = newItem('bat')
    grunt.receiveHit(LAUNCH, 1, world)
    expect(grunt.held).toBeNull()
    expect(world.items.some((i) => i.item.type === 'bat')).toBe(true)
  })
})

describe('juggle exceptions', () => {
  it('bosses are never launched', () => {
    const world = new World({ mode: 'sandbox' })
    world.agent.x = 100
    world.spawn({ boss: 'ryu', side: 'right' })
    const boss = world.boss!
    boss.receiveHit(LAUNCH, 1)
    run(world, 10)
    expect(boss.h).toBe(0)
  })

  it('with a weapon in hand, ↑+Z just swings the weapon (no launcher)', () => {
    const { world, grunt, damage } = setup()
    world.agent.held = newItem('bat')
    tick(world, ['punch'], ['up'])
    run(world, 30)
    expect(damage()).toBe(14)
    expect(grunt.juggled).toBe(false)
  })

  it('a weapon hit on a juggled grunt counts as a juggle hit', () => {
    const { world, grunt, damage } = setup()
    world.agent.held = newItem('katana')
    world.agent.x = grunt.x - 30
    world.agent.facing = 1
    // 先起手揮刀，刀快落下時才把雜兵輕輕打上低空（武器揮不到太高的地方）
    tick(world, ['punch'])
    run(world, 6)
    grunt.receiveHit({ ...LAUNCH, launch: 3 }, 1, world)
    for (let i = 0; i < 12 && damage() < 23; i++) tick(world)
    expect(damage()).toBe(1 + 22)
    expect(grunt.juggled).toBe(true)
  })
})

describe('combo counter and hints', () => {
  it('the full air combo counts 4 hits', () => {
    const { world } = setup()
    fullCombo(world)
    expect(world.combo.count).toBe(4)
    expect(world.score).toBe(4 * 10)
  })

  it('an enemy hit on the agent breaks the combo', () => {
    const world = new World({ mode: 'sandbox' })
    world.agent.x = 300
    world.enemies = [new Grunt(318, 'thug', { moves: ['kick'] })]
    world.combo.hit(world.realFrame)
    world.combo.hit(world.realFrame)
    for (let i = 0; i < 600 && world.agent.life.hp === world.agent.life.max; i++) {
      world.combo.hit(world.realFrame) // 持續保持連擊，直到特務被打中
      tick(world)
    }
    expect(world.agent.life.hp).toBeLessThan(world.agent.life.max)
    expect(world.combo.count).toBe(0)
  })

  it('hints the next button through the air combo', () => {
    const { world } = setup()
    const hints: (string | null)[] = []
    const record = () => {
      const h = world.comboHint()
      if (h && hints[hints.length - 1] !== h) hints.push(h)
    }
    tick(world, ['punch'], ['up'])
    for (let i = 0; i < 7; i++) {
      tick(world, [], ['up'])
      record()
    }
    tick(world, ['jump'])
    for (let i = 0; i < 8; i++) {
      tick(world)
      record()
    }
    tick(world, ['punch'])
    for (let i = 0; i < 7; i++) {
      tick(world)
      record()
    }
    tick(world, ['punch'])
    for (let i = 0; i < 7; i++) {
      tick(world)
      record()
    }
    expect(hints).toEqual(['jump', 'punch', 'kick'])
  })

  it('no hint when the launcher whiffs', () => {
    const { world, grunt } = setup()
    grunt.x = 500
    tick(world, ['punch'], ['up'])
    for (let i = 0; i < 15; i++) {
      tick(world, [], ['up'])
      expect(world.comboHint()).toBeNull()
    }
  })
})
