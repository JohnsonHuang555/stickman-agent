import { describe, expect, it } from 'vitest'
import { GROIN_STUN, MOVES } from './agent/moves'
import { AGENT_GROIN_STUN } from './enemies/enemyMoves'
import { Grunt } from './enemies/grunt'
import type { Button } from './input/buttons'
import { SIMULTANEOUS_WINDOW } from './input/commands'
import { posePoints } from './stickman/pose'
import { World } from './world'

function tick(world: World, pressed: Button[] = [], held: Button[] = []) {
  world.update({ pressed, held: new Set([...held, ...pressed]) })
}
function run(world: World, frames: number) {
  for (let i = 0; i < frames; i++) tick(world)
}

function arena(type: 'thug' | 'heavy' = 'heavy', passive = true) {
  const world = new World({ mode: 'sandbox' })
  world.items = []
  world.agent.x = 300
  world.agent.life.hp = 99999
  const g = new Grunt(318, type, { passive, moves: ['jab'] })
  g.life.hp = 999
  world.enemies = [g]
  return { world, g }
}

/** 按 X、隔 gap 幀再按 X。 */
function doubleKick(world: World, gap: number) {
  tick(world, ['kick'])
  run(world, gap - 1)
  tick(world, ['kick'])
}

/** 雜兵是不是摀著下體彎腰：身體前傾、兩隻手都在骨盆附近。 */
function clutching(g: Grunt): boolean {
  const pose = g.pose()
  const pts = posePoints(pose, g.scale)
  const [hipX, hipUp] = pts[0]
  const near = ([x, up]: [number, number]) => Math.abs(x - hipX) < 8 * g.scale && Math.abs(up - hipUp) < 8 * g.scale
  return pose.lean > 40 && near(pts[3]) && near(pts[5])
}

describe('groin kick (double-tap X)', () => {
  it.each([2, 4, 6, 8, 10])('X, X %i frames apart: kicks the groin and the enemy doubles over clutching it', (gap) => {
    const { world, g } = arena()
    doubleKick(world, gap)
    let seen = false
    for (let i = 0; i < 30; i++) {
      tick(world)
      seen ||= clutching(g)
    }
    expect(seen).toBe(true)
    // 連按得快：第一下還沒踢到就換成踢下體（4）；連按得慢：第一下先踢中再接踢下體（10 + 4）
    expect([MOVES.groinKick.hit.damage, MOVES.kick.hit.damage + MOVES.groinKick.hit.damage]).toContain(999 - g.life.hp)
  })

  it('a single X is still the normal kick', () => {
    const { world, g } = arena()
    tick(world, ['kick'])
    run(world, 40)
    expect(999 - g.life.hp).toBe(MOVES.kick.hit.damage)
  })

  it('two X presses far apart are two normal kicks, not a groin kick', () => {
    const { world, g } = arena()
    tick(world, ['kick'])
    run(world, 40)
    tick(world, ['kick'])
    let seen = false
    for (let i = 0; i < 40; i++) {
      tick(world)
      seen ||= clutching(g)
    }
    expect(seen).toBe(false)
  })

  it('the enemy stays doubled over about GROIN_STUN frames and cannot attack, then recovers', () => {
    const { world, g } = arena('thug', false)
    doubleKick(world, 4)
    run(world, 12)
    expect(clutching(g)).toBe(true)
    const hp = world.agent.life.hp
    run(world, GROIN_STUN - 30)
    expect(clutching(g)).toBe(true)
    expect(world.agent.life.hp).toBe(hp) // 彎著腰不會出招
    run(world, 40)
    expect(clutching(g)).toBe(false)
  })

  it('a doubled-over enemy can be grabbed with C', () => {
    const { world, g } = arena()
    doubleKick(world, 4)
    run(world, 15)
    world.agent.x = g.x - 16
    tick(world, ['grab'])
    run(world, SIMULTANEOUS_WINDOW + 1)
    expect(g.isGrabbed).toBe(true)
  })

  it('bosses just take the damage, they do not double over', () => {
    const world = new World({ mode: 'sandbox' })
    world.items = []
    world.agent.x = 300
    world.spawn({ boss: 'kane', side: 'right' })
    const boss = world.boss!
    boss.x = 318
    const hp = boss.life.hp
    doubleKick(world, 4)
    run(world, 20)
    expect(hp - boss.life.hp).toBe(MOVES.groinKick.hit.damage)
    expect(boss.pose().lean).toBeLessThan(40)
  })
})

describe('enemies can groin-kick the agent too', () => {
  function kickedAgent() {
    const world = new World({ mode: 'sandbox' })
    world.items = []
    world.agent.x = 300
    world.agent.life.hp = 99999
    const g = new Grunt(320, 'thug', { moves: ['groinKick'] })
    world.enemies = [g]
    let frames = 0
    for (; frames < 600 && world.agent.pose().lean <= 40; frames++) tick(world)
    return { world, g, frames }
  }

  it('the agent doubles over clutching the groin and cannot move until it wears off', () => {
    const { world, frames } = kickedAgent()
    expect(frames).toBeLessThan(600)
    const pts = posePoints(world.agent.pose())
    const [hipX, hipUp] = pts[0]
    for (const hand of [pts[3], pts[5]]) {
      expect(Math.abs(hand[0] - hipX)).toBeLessThan(8)
      expect(Math.abs(hand[1] - hipUp)).toBeLessThan(8)
    }
    const x0 = world.agent.x
    for (let i = 0; i < AGENT_GROIN_STUN - 10; i++) tick(world, [], ['left'])
    expect(Math.abs(world.agent.x - x0)).toBeLessThan(3) // 摀著下體時不能走
    for (let i = 0; i < 30; i++) tick(world, [], ['left'])
    expect(world.agent.x).toBeLessThan(x0 - 10) // 恢復後可以走了
  })

  it('jumping over it avoids the groin kick', () => {
    const world = new World({ mode: 'sandbox' })
    world.items = []
    world.agent.x = 300
    const g = new Grunt(320, 'thug', { moves: ['groinKick'] })
    world.enemies = [g]
    for (let i = 0; i < 600 && !g.attacking; i++) tick(world)
    for (let i = 0; i < 6; i++) tick(world) // 看到起手才跳
    tick(world, ['jump'])
    run(world, 25)
    expect(world.agent.life.hp).toBe(world.agent.life.max)
  })
})

describe('pain hop (regression for "they should hop a little to show it hurts")', () => {
  const hopsDuring = (pose: () => { lift: number }, stepper: () => void, frames: number) => {
    let maxLift = 0
    for (let i = 0; i < frames; i++) {
      stepper()
      maxLift = Math.max(maxLift, pose().lift)
    }
    return maxLift
  }

  it('a groin-kicked enemy hops while clutching', () => {
    const { world, g } = arena()
    doubleKick(world, 4)
    expect(hopsDuring(() => g.pose(), () => tick(world), 40)).toBeGreaterThan(4)
  })

  it('a groin-kicked agent hops while clutching', () => {
    const world = new World({ mode: 'sandbox' })
    world.items = []
    world.agent.x = 300
    world.agent.life.hp = 99999
    world.enemies = [new Grunt(320, 'thug', { moves: ['groinKick'] })]
    for (let i = 0; i < 600 && world.agent.pose().lean <= 40; i++) tick(world)
    expect(hopsDuring(() => world.agent.pose(), () => tick(world), 30)).toBeGreaterThan(4)
  })
})
