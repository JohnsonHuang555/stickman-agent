import { describe, expect, it } from 'vitest'
import { ENEMY_HOLD, ENEMY_HOLD_HITS } from './enemies/enemyMoves'
import { Grunt } from './enemies/grunt'
import type { Button } from './input/buttons'
import { World } from './world'

function tick(world: World, pressed: Button[] = [], held: Button[] = []) {
  world.update({ pressed, held: new Set([...held, ...pressed]) })
}

/** 特務面前一個只會抓人的壯漢；等到被抓住為止。 */
function grabbedAgent() {
  const world = new World({ mode: 'sandbox' })
  world.items = []
  world.agent.x = 300
  world.agent.life.hp = 9999
  const g = new Grunt(318, 'heavy', { moves: ['grab'], held: null })
  world.enemies = [g]
  let frames = 0
  for (; frames < 600 && !world.agent.isHeld; frames++) tick(world)
  return { world, g, frames, hp0: world.agent.life.hp }
}

describe('enemies grab the agent', () => {
  it('a heavy grabs the agent: held in front of it, cannot walk away', () => {
    const { world, g, frames } = grabbedAgent()
    expect(frames).toBeLessThan(600)
    expect(g.holding).toBe(true)
    const x0 = world.agent.x
    for (let i = 0; i < 20; i++) tick(world, [], ['left'])
    expect(world.agent.x).toBeCloseTo(x0, 0)
  })

  it('doing nothing: three knees, then thrown down', () => {
    const { world, hp0 } = grabbedAgent()
    // 膝撞有頓幀，實際幀數會比 throwAt 長一點：等到被放開為止
    for (let i = 0; i < 200 && world.agent.isHeld; i++) tick(world)
    expect(world.agent.isHeld).toBe(false)
    let maxH = 0
    for (let i = 0; i < 15; i++) {
      tick(world)
      maxH = Math.max(maxH, world.agent.h)
    }
    expect(maxH).toBeGreaterThan(0) // 被摔飛到空中（頓幀結束後才飛起來）
    expect(hp0 - world.agent.life.hp).toBe(ENEMY_HOLD_HITS.knee.damage * ENEMY_HOLD.knees + ENEMY_HOLD_HITS.throw.damage)
  })

  it.each([5, 7, 9])('mashing every %i frames breaks free before being thrown; the heavy staggers, the agent is briefly invulnerable', (every) => {
    const { world, g, hp0 } = grabbedAgent()
    const keys: Button[] = ['punch', 'kick', 'left', 'right']
    let escapedAt = -1
    for (let i = 0; i < 200 && escapedAt < 0; i++) {
      tick(world, i % every === 0 ? [keys[(i / every) % keys.length]] : [])
      if (!world.agent.isHeld) escapedAt = i
    }
    expect(escapedAt).toBeGreaterThan(0)
    expect(world.agent.invuln).toBeGreaterThan(0)
    expect(g.holding).toBe(false)
    // 沒被摔出去：最多吃到膝撞，人還站在地上
    expect(hp0 - world.agent.life.hp).toBeLessThanOrEqual(ENEMY_HOLD_HITS.knee.damage * ENEMY_HOLD.knees)
    expect(world.agent.h).toBe(0)
  })

  it('cannot grab the agent in the air', () => {
    const world = new World({ mode: 'sandbox' })
    world.items = []
    world.agent.x = 300
    const g = new Grunt(318, 'heavy', { moves: ['grab'], held: null })
    world.enemies = [g]
    for (let i = 0; i < 600 && !g.attacking; i++) tick(world)
    for (let i = 0; i < 4; i++) tick(world)
    tick(world, ['up']) // 看到伸手就跳
    for (let i = 0; i < 20; i++) tick(world)
    expect(world.agent.isHeld).toBe(false)
  })

  it('getting hit by another enemy while held breaks the hold', () => {
    const { world, g } = grabbedAgent()
    world.agent.receiveHit({ ...ENEMY_HOLD_HITS.knee, holdHit: false }, -1, world)
    tick(world)
    expect(world.agent.isHeld).toBe(false)
    tick(world)
    expect(g.holding).toBe(false)
  })
})
