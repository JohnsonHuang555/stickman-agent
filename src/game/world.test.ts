import { describe, expect, it } from 'vitest'
import type { EnemyType } from './enemies/enemyTypes'
import { Grunt } from './enemies/grunt'
import type { Button } from './input/buttons'
import { World } from './world'

/** 建一個只有一個雜兵、站在特務正前方的世界。 */
function arena(gap = 14) {
  const world = new World({ mode: 'sandbox' })
  world.agent.x = 300
  const grunt = new Grunt(300 + gap, 'heavy', { passive: true })
  world.enemies = [grunt]
  return { world, grunt }
}

function tick(world: World, pressed: Button[] = [], held: Button[] = []) {
  world.update({ pressed, held: new Set([...held, ...pressed]) })
}

function run(world: World, frames: number, held: Button[] = []) {
  for (let i = 0; i < frames; i++) tick(world, [], held)
}

describe('World simulation', () => {
  it('holding right walks the agent right', () => {
    const { world } = arena()
    world.enemies = []
    run(world, 30, ['right'])
    expect(world.agent.x).toBeGreaterThan(330)
  })

  it('a single punch damages the grunt and scores', () => {
    const { world, grunt } = arena()
    tick(world, ['punch'])
    run(world, 20)
    expect(grunt.life.hp).toBe(grunt.life.max - 6)
    expect(world.score).toBe(10)
  })

  it('mashing z chains the three-hit combo', () => {
    const { world, grunt } = arena()
    for (let i = 0; i < 6; i++) {
      tick(world, ['punch'])
      run(world, 7)
    }
    run(world, 30)
    expect(grunt.life.max - grunt.life.hp).toBe(6 + 7 + 10)
  })

  it('the full combo connects on a normal-sized grunt (knockback does not push it out of range)', () => {
    const { world } = arena()
    const thug = new Grunt(314, 'thug', { passive: true })
    world.enemies = [thug]
    for (let i = 0; i < 6; i++) {
      tick(world, ['punch'])
      run(world, 7)
    }
    run(world, 30)
    expect(thug.life.max - thug.life.hp).toBe(6 + 7 + 10)
  })

  it('z + x + c costs the agent life and hits', () => {
    const { world, grunt } = arena()
    tick(world, ['punch', 'kick', 'grab'])
    run(world, 40)
    expect(world.agent.life.hp).toBe(192)
    expect(grunt.life.max - grunt.life.hp).toBe(12)
  })

  it('pressing x + c while still holding z cancels the punch into the desperation move', () => {
    const { world, grunt } = arena()
    tick(world, ['punch'])
    run(world, 2, ['punch'])
    tick(world, ['kick', 'grab'], ['punch'])
    run(world, 40)
    expect(world.agent.life.hp).toBe(192)
    expect(grunt.life.max - grunt.life.hp).toBe(12)
  })

  it('z + x + c does not also pick up the item at your feet', () => {
    const { world, grunt } = arena()
    world.placeItem('bat', 302)
    tick(world, ['grab'])
    tick(world, ['punch', 'kick'], ['grab'])
    run(world, 40)
    expect(world.agent.life.hp).toBe(192)
    expect(world.agent.held).toBeNull()
    expect(grunt.life.max - grunt.life.hp).toBe(12)
  })

  it('z + x (without c) is a kick, not the desperation move', () => {
    const { world } = arena()
    tick(world, ['punch', 'kick'])
    run(world, 40)
    expect(world.agent.life.hp).toBe(world.agent.life.max)
  })

  it('tapping z then x quickly is a punch followed by a kick, not the desperation move', () => {
    const { world } = arena()
    tick(world, ['punch'])
    run(world, 2)
    tick(world, ['kick'])
    run(world, 40)
    expect(world.agent.life.hp).toBe(world.agent.life.max)
  })

  it('jumping leaves the ground and lands again', () => {
    const { world } = arena()
    world.enemies = []
    tick(world, ['jump'])
    run(world, 5)
    expect(world.agent.h).toBeGreaterThan(0)
    run(world, 60)
    expect(world.agent.h).toBe(0)
  })

  it('direction + x in the air is a flying kick that dashes forward and connects', () => {
    const { world, grunt } = arena(40)
    tick(world, ['jump'])
    run(world, 8)
    tick(world, ['kick'], ['right'])
    run(world, 60)
    expect(grunt.life.max - grunt.life.hp).toBe(12)
  })

  it('x alone in the air is an air kick: no forward dash (regression)', () => {
    const { world } = arena()
    world.enemies = []
    tick(world, ['jump']) // 垂直起跳
    run(world, 8)
    const x0 = world.agent.x
    tick(world, ['kick'])
    run(world, 30)
    expect(Math.abs(world.agent.x - x0)).toBeLessThan(3)
  })

  it('an air kick still hits someone in front', () => {
    const { world, grunt } = arena(20)
    tick(world, ['jump'])
    run(world, 4)
    tick(world, ['kick'])
    run(world, 30)
    expect(grunt.life.max - grunt.life.hp).toBe(9)
  })

  it('crouching z sweeps', () => {
    const { world, grunt } = arena(16)
    run(world, 2, ['down'])
    tick(world, ['punch'], ['down'])
    run(world, 30, ['down'])
    expect(grunt.life.max - grunt.life.hp).toBe(8)
  })

  it('double-tap forward + z dashes into the grunt', () => {
    const { world, grunt } = arena(50)
    tick(world, ['right'])
    run(world, 3)
    tick(world, ['right'])
    tick(world, ['punch'])
    run(world, 40)
    expect(grunt.life.max - grunt.life.hp).toBe(12)
  })

  it('a knocked-down grunt flying into another one hurts it', () => {
    const { world, grunt } = arena(14)
    const behind = new Grunt(350, 'heavy', { passive: true })
    world.enemies.push(behind)
    for (let i = 0; i < 6; i++) {
      tick(world, ['punch'])
      run(world, 7)
    }
    run(world, 60)
    expect(grunt.life.max - grunt.life.hp).toBe(23)
    expect(behind.life.hp).toBeLessThan(behind.life.max)
  })
})

describe('Grunt AI', () => {
  function brawl(types: EnemyType[]) {
    const world = new World({ mode: 'sandbox' })
    world.agent.x = 400
    world.enemies = types.map((t, i) => new Grunt(250 + i * 60 + (i % 2 ? 250 : 0), t))
    return world
  }

  it('grunts close in and hurt an idle agent', () => {
    const world = brawl(['thug'])
    run(world, 400)
    expect(world.agent.life.hp).toBeLessThan(world.agent.life.max)
  })

  it('never more than two grunts attack at once', () => {
    const world = brawl(['thug', 'thug', 'bruiser', 'knifer', 'thug'])
    let maxAttackers = 0
    for (let i = 0; i < 900; i++) {
      tick(world)
      maxAttackers = Math.max(maxAttackers, world.slots.count)
    }
    expect(maxAttackers).toBeLessThanOrEqual(2)
    expect(maxAttackers).toBeGreaterThan(0)
  })

  it('an idle agent eventually dies and the game is over', () => {
    const world = brawl(['heavy', 'thug', 'knifer'])
    for (let i = 0; i < 6000 && !world.gameOver; i++) tick(world)
    expect(world.agent.life.isDead).toBe(true)
    expect(world.gameOver).toBe(true)
  })

  it('pressing z after game over requests a restart', () => {
    const world = brawl(['heavy', 'thug', 'knifer'])
    for (let i = 0; i < 6000 && !world.gameOver; i++) tick(world)
    tick(world, ['punch'])
    expect(world.restartRequested).toBe(false) // 剛陣亡時忽略連打
    run(world, 60)
    tick(world, ['punch'])
    expect(world.restartRequested).toBe(true)
  })

  it('the heavy shrugs off a jab during its slam (super armor) and still lands it', () => {
    const world = new World({ mode: 'sandbox' })
    world.agent.x = 300
    const heavy = new Grunt(318, 'heavy', { moves: ['slam'] })
    world.enemies = [heavy]
    for (let i = 0; i < 600 && !heavy.attacking; i++) tick(world)
    expect(heavy.attacking).toBe(true)

    world.agent.x = heavy.x - 14
    world.agent.facing = 1
    tick(world, ['punch'])
    run(world, 8)
    expect(heavy.life.hp).toBe(heavy.life.max - 6)
    expect(heavy.attacking).toBe(true)

    run(world, 30)
    expect(world.agent.life.hp).toBe(world.agent.life.max - 18)
  })

  it('crouching ducks under a jab', () => {
    const world = new World({ mode: 'sandbox' })
    world.agent.x = 300
    world.enemies = [new Grunt(318, 'thug', { moves: ['jab'] })]
    run(world, 400, ['down'])
    expect(world.agent.life.hp).toBe(world.agent.life.max)
  })

  it('a kick still hits a crouching agent', () => {
    const world = new World({ mode: 'sandbox' })
    world.agent.x = 300
    world.enemies = [new Grunt(320, 'thug', { moves: ['kick'] })]
    run(world, 400, ['down'])
    expect(world.agent.life.hp).toBeLessThan(world.agent.life.max)
  })
})

describe('reach', () => {
  it('a kick reaches a grunt that a punch cannot', () => {
    const punched = arena(40)
    tick(punched.world, ['punch'])
    run(punched.world, 20)
    expect(punched.grunt.life.hp).toBe(punched.grunt.life.max)

    const kicked = arena(40)
    tick(kicked.world, ['kick'])
    run(kicked.world, 30)
    expect(kicked.grunt.life.max - kicked.grunt.life.hp).toBe(10)
  })
})

describe('air control', () => {
  it('pressing a direction in the air turns the agent and steers toward it', () => {
    const { world } = arena()
    world.enemies = []
    tick(world, ['jump'])
    run(world, 3)
    expect(world.agent.facing).toBe(1)
    const x0 = world.agent.x
    run(world, 15, ['left'])
    expect(world.agent.facing).toBe(-1)
    expect(world.agent.x).toBeLessThan(x0)
  })

  it('steering keeps some of the jump momentum instead of reversing instantly', () => {
    const { world } = arena()
    world.enemies = []
    tick(world, ['jump'], ['right'])
    run(world, 2, ['right'])
    const x0 = world.agent.x
    tick(world, [], ['left'])
    expect(world.agent.x).toBeGreaterThan(x0) // 第一幀仍往右滑
  })

  it('an air attack faces the held direction, so you can hit someone behind you', () => {
    const { world } = arena()
    const behind = new Grunt(282, 'heavy', { passive: true })
    world.enemies = [behind]
    world.agent.facing = 1
    tick(world, ['jump'])
    run(world, 1)
    tick(world, ['punch'], ['left'])
    run(world, 12, ['left'])
    expect(behind.life.max - behind.life.hp).toBe(5)
  })
})

describe('plain jumping attacks (regression for "air punch goes slow-motion and ignores direction keys")', () => {
  /** 跳起來後第 delay 幀按 pressed，回傳落地所需幀數與落地時的 x。 */
  function jumpAndLand(pressed: Button[] | null, held: Button[] = [], delay = 4) {
    const { world } = arena()
    world.enemies = []
    tick(world, ['jump'], held)
    let frames = 1
    for (; frames < 120 && (frames < 3 || world.agent.h > 0); frames++) {
      tick(world, frames === delay && pressed ? pressed : [], held)
    }
    return { frames, x: world.agent.x }
  }

  it('an air punch with nobody around does not make the agent hang in the air', () => {
    const plain = jumpAndLand(null)
    const punched = jumpAndLand(['punch'])
    expect(punched.frames - plain.frames).toBeLessThanOrEqual(3)
  })

  it('direction keys pressed during an air punch still move the agent', () => {
    const { world } = arena()
    world.enemies = []
    tick(world, ['jump']) // 垂直起跳，沒有按方向
    run(world, 3)
    tick(world, ['punch'])
    const x0 = world.agent.x
    run(world, 12, ['right']) // 出拳之後才按 →
    expect(world.agent.x - x0).toBeGreaterThan(15)
  })

  it('a whiffed air punch recovers quickly, so the agent can turn around before landing', () => {
    const { world } = arena()
    world.enemies = []
    tick(world, ['jump'])
    run(world, 3)
    tick(world, ['punch'])
    run(world, 12)
    run(world, 2, ['left'])
    expect(world.agent.airborne).toBe(true)
    expect(world.agent.facing).toBe(-1)
  })
})
