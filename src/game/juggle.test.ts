import { describe, expect, it } from 'vitest'
import { LAUNCH_VELOCITY } from './agent/moves'
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

/** 挑空技的輸入：S → W + J（↓ 再 ↑ 接拳）。 */
function launchInput(world: World, held: Button[] = []) {
  tick(world, ['down'], held)
  tick(world, ['up'], held)
  tick(world, ['punch'], held)
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
const LAUNCH: HitSpec = { ...JAB, launch: LAUNCH_VELOCITY }
const SPIKE: HitSpec = { ...JAB, spike: true, knockdown: true }

/** S → W + J（挑空）→ 跳 → J → J → K，每步之間等對的幀數。 */
function fullCombo(world: World) {
  launchInput(world)
  run(world, 7)
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
    launchInput(world)
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
    launchInput(world)
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

describe('combo counter', () => {
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
})

describe('human-paced timing (regression for "the air combo is hard to land")', () => {
  /** 每一步之間等待的幀數：d1 挑空→跳、d2 跳→Z、d3 Z→Z、d4 Z→X */
  function attempt(type: 'thug' | 'heavy', d1: number, d2: number, d3: number, d4: number) {
    const { world, damage } = setup(type)
    launchInput(world)
    run(world, d1 - 1)
    tick(world, ['jump'])
    run(world, d2 - 1)
    tick(world, ['punch'])
    run(world, d3 - 1)
    tick(world, ['punch'])
    run(world, d4 - 1)
    tick(world, ['kick'])
    run(world, 40)
    return damage()
  }

  it('connects even when every step is pressed late (reacting to the hints)', () => {
    for (const type of ['thug', 'heavy'] as const) {
      expect(attempt(type, 24, 22, 28, 30)).toBe(8 + 5 + 6 + 10)
    }
  })

  it('every step has at least half a second (30 frames) of leeway', () => {
    const nominal = [8, 9, 8, 8]
    for (let step = 0; step < 4; step++) {
      for (let d = 2; d <= 30; d++) {
        const ds = [...nominal] as [number, number, number, number]
        ds[step] = Math.max(d, step === 0 ? 5 : 1)
        expect(attempt('thug', ...ds), `step ${step} delay ${ds[step]}`).toBe(29)
      }
    }
  })

  it('after an unchained air punch ends, there is still a short grace window to continue', () => {
    const { world, damage } = setup()
    launchInput(world)
    run(world, 7)
    tick(world, ['jump'])
    run(world, 8)
    tick(world, ['punch'])
    run(world, 34) // 第一拳的收招已經結束（含頓幀約 30 幀）
    tick(world, ['punch'])
    run(world, 10)
    expect(damage()).toBe(8 + 5 + 6)
  })
})

describe('air feel (regression for "enemies freeze in the air")', () => {
  it('a juggled grunt tumbles, and the tumble resets once it is down', () => {
    const { world, grunt } = setup()
    grunt.receiveHit(LAUNCH, 1, world)
    run(world, 6)
    grunt.receiveHit(JAB, 1, world)
    run(world, 6)
    expect(Math.abs(grunt.rotation)).toBeGreaterThan(0.3)
    for (let i = 0; i < 120 && grunt.h > 0; i++) tick(world)
    run(world, 2)
    expect(grunt.rotation).toBe(0)
  })

  it('without more hits, a juggled grunt drops from its apex within about 0.4s instead of hovering', () => {
    const { world, grunt } = setup()
    grunt.receiveHit(LAUNCH, 1, world)
    let apex = 0
    for (let i = 0; i < 60 && grunt.vh > 0; i++) {
      tick(world)
      apex = Math.max(apex, grunt.h)
    }
    expect(apex).toBeGreaterThan(55)
    expect(apex).toBeLessThan(85) // 接近特務跳躍的最高點（約 64px），不會飛得太高
    let framesToLand = 0
    while (grunt.h > 0 && framesToLand < 60) {
      tick(world)
      framesToLand++
    }
    expect(framesToLand).toBeLessThanOrEqual(26)
  })

  it('every juggle hit visibly pushes the grunt back a little, but not out of reach', () => {
    const { world, grunt } = setup()
    grunt.receiveHit(LAUNCH, 1, world)
    run(world, 10)
    const x0 = grunt.x
    grunt.receiveHit(JAB, 1, world)
    run(world, 20)
    expect(grunt.x - x0).toBeGreaterThan(3)
    expect(grunt.x - x0).toBeLessThan(8)
  })
})

describe('holding a direction during the air combo', () => {
  it('holding toward the enemy the whole time does not overshoot it', () => {
    for (const delays of [[8, 9, 8, 8], [24, 22, 28, 30]]) {
      const { world, damage } = setup()
      const hold: Button[] = ['right']
      const step = (pressed: Button[], wait: number, extra: Button[] = []) => {
        tick(world, pressed, [...hold, ...extra])
        run(world, wait - 1, hold)
      }
      launchInput(world, hold)
      run(world, delays[0] - 1, hold)
      step(['jump'], delays[1])
      step(['punch'], delays[2])
      step(['punch'], delays[3])
      step(['kick'], 40)
      expect(damage(), `delays ${delays}`).toBe(29)
    }
  })

  it('the agent never ends up inside or past a juggled enemy', () => {
    const { world, grunt } = setup()
    launchInput(world, ['right'])
    run(world, 6, ['right'])
    tick(world, ['jump'], ['right'])
    for (let i = 0; i < 30; i++) {
      tick(world, [], ['right'])
      if (grunt.juggled) expect(grunt.x - world.agent.x).toBeGreaterThanOrEqual(16 - 0.001)
    }
  })
})
