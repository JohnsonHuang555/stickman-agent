import { describe, expect, it } from 'vitest'
import { GROIN_STUN, MOVES } from './agent/moves'
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
