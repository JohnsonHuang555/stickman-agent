import { describe, expect, it } from 'vitest'
import { GRAB, GRAB_HITS } from './agent/grab'
import { Grunt } from './enemies/grunt'
import type { Button } from './input/buttons'
import { SIMULTANEOUS_WINDOW } from './input/commands'
import { newItem } from './items/itemTypes'
import { World } from './world'

function tick(world: World, pressed: Button[] = [], held: Button[] = []) {
  world.update({ pressed, held: new Set([...held, ...pressed]) })
}
function run(world: World, frames: number, held: Button[] = []) {
  for (let i = 0; i < frames; i++) tick(world, [], held)
}

/** 特務面前一個雜兵，直接按 C 抓住。 */
function grabbed(gap = 16, type: 'thug' | 'heavy' = 'thug') {
  const world = new World({ mode: 'sandbox' })
  world.items = []
  world.agent.x = 300
  const g = new Grunt(300 + gap, type, { passive: true })
  g.life.hp = 999
  world.enemies = [g]
  tick(world, ['grab'])
  run(world, SIMULTANEOUS_WINDOW + 1)
  return { world, g }
}

const lost = (g: Grunt) => 999 - g.life.hp

describe('grabbing (C)', () => {
  it('C in front of an enemy grabs it (no need to hit it first) and holds it at arm’s length', () => {
    const { world, g } = grabbed()
    expect(g.isGrabbed).toBe(true)
    expect(g.x - world.agent.x).toBeCloseTo(GRAB.distance)
    expect(g.hurtbox()).toBeNull() // 被抓著時其他攻擊打不到
  })

  it('an enemy that is mid-attack can be grabbed too (the grab cancels its attack)', () => {
    const world = new World({ mode: 'sandbox' })
    world.items = []
    world.agent.x = 300
    world.agent.life.hp = 9999 // 無敵的話雜兵不會出招，改成血很多
    const g = new Grunt(318, 'thug', { moves: ['jab'] })
    world.enemies = [g]
    for (let i = 0; i < 1200 && !g.attacking; i++) tick(world)
    expect(g.attacking).toBe(true)
    // 站到雜兵面向的那一側，面對它
    world.agent.x = g.x + g.facing * 16
    world.agent.facing = g.facing === 1 ? -1 : 1
    tick(world, ['grab'])
    run(world, SIMULTANEOUS_WINDOW + 1)
    expect(g.isGrabbed).toBe(true)
    expect(g.attacking).toBe(false)
  })

  it.each([
    ['too far away', 60],
    ['behind you', -16],
  ] as const)('cannot grab an enemy that is %s', (_n, gap) => {
    const world = new World({ mode: 'sandbox' })
    world.items = []
    world.agent.x = 300
    const g = new Grunt(300 + gap, 'thug', { passive: true })
    world.enemies = [g]
    tick(world, ['grab'])
    run(world, 10)
    expect(g.isGrabbed).toBe(false)
  })

  it('cannot grab an enemy that is knocked down or in the air', () => {
    const world = new World({ mode: 'sandbox' })
    world.items = []
    world.agent.x = 300
    const g = new Grunt(316, 'thug', { passive: true })
    g.life.hp = 999
    world.enemies = [g]
    g.receiveHit({ ...GRAB_HITS.throw, knockback: 0.1 }, 1, world)
    for (let i = 0; i < 60; i++) {
      tick(world, i === 0 || i === 30 ? ['grab'] : [])
      expect(g.isGrabbed).toBe(false)
    }
  })

  it('bosses cannot be grabbed', () => {
    const world = new World({ mode: 'sandbox' })
    world.items = []
    world.agent.x = 300
    world.spawn({ boss: 'kane', side: 'right' })
    world.boss!.x = 316
    tick(world, ['punch'])
    run(world, 6)
    tick(world, ['grab'])
    run(world, 10)
    expect(world.grabTarget(world.agent)).toBeNull()
  })

  it('with an item at your feet, C still picks the item up instead', () => {
    const world = new World({ mode: 'sandbox' })
    world.items = []
    world.agent.x = 300
    const g = new Grunt(316, 'thug', { passive: true })
    g.life.hp = 999
    world.enemies = [g]
    world.placeItem('bat', 300)
    run(world, 30)
    tick(world, ['punch'])
    run(world, 6)
    tick(world, ['grab'])
    run(world, 10)
    expect(world.agent.held?.type).toBe('bat')
    expect(g.isGrabbed).toBe(false)
  })

  it('holding a weapon, C throws the weapon instead of grabbing', () => {
    const world = new World({ mode: 'sandbox' })
    world.items = []
    world.agent.x = 300
    world.agent.held = newItem('bat')
    const g = new Grunt(316, 'thug', { passive: true })
    world.enemies = [g]
    tick(world, ['punch'])
    run(world, 8)
    tick(world, ['grab'])
    run(world, 10)
    expect(g.isGrabbed).toBe(false)
  })

  it('doing nothing, the enemy breaks free after GRAB.hold frames', () => {
    const { world, g } = grabbed()
    run(world, GRAB.hold - 10)
    expect(g.isGrabbed).toBe(true)
    run(world, 15)
    expect(g.isGrabbed).toBe(false)
  })

  it('getting hit by another enemy makes you let go', () => {
    const { world, g } = grabbed()
    world.agent.receiveHit({ ...GRAB_HITS.knee, damage: 5, hitstun: 10 }, -1, world)
    expect(g.isGrabbed).toBe(false)
  })
})

describe('grab moves', () => {
  it('Z knees: 6, 6, then the third knee (8) knocks down and ends the grab', () => {
    const { world, g } = grabbed()
    for (let i = 0; i < 2; i++) {
      tick(world, ['punch'])
      run(world, GRAB.knee.length + 2)
      expect(g.isGrabbed).toBe(true)
    }
    expect(lost(g)).toBe(12)
    tick(world, ['punch'])
    run(world, GRAB.knee.length + 2)
    expect(lost(g)).toBe(20)
    expect(g.isGrabbed).toBe(false)
  })

  it('X throws forward: 12 damage and the enemy flies away from you', () => {
    const { world, g } = grabbed()
    tick(world, ['kick'])
    run(world, 40)
    expect(lost(g)).toBe(12)
    expect(g.x - world.agent.x).toBeGreaterThan(50)
  })

  it('a thrown enemy knocks down another enemy it flies into', () => {
    const { world, g } = grabbed()
    const other = new Grunt(380, 'thug', { passive: true })
    other.life.hp = 999
    world.enemies.push(other)
    tick(world, ['kick'])
    run(world, 40)
    expect(lost(g)).toBeGreaterThanOrEqual(12)
    expect(999 - other.life.hp).toBeGreaterThan(0)
  })

  it('back + X: over-the-shoulder throw lifts the enemy over your head and slams it behind you for 16', () => {
    const { world, g } = grabbed()
    tick(world, ['kick'], ['left'])
    let maxH = 0
    let wentBehind = false
    for (let i = 0; i < GRAB.suplex.length + 10; i++) {
      tick(world) // 方向只要在按 X 的那一下按著
      maxH = Math.max(maxH, g.h)
      wentBehind ||= g.x < world.agent.x
    }
    expect(maxH).toBeGreaterThan(35) // 舉過頭
    expect(wentBehind).toBe(true)
    expect(lost(g)).toBe(16)
    expect(world.agent.facing).toBe(1) // 特務本身不轉身
  })

  it('the over-the-shoulder throw cannot be interrupted (you are invulnerable during it)', () => {
    const { world } = grabbed()
    tick(world, ['kick'], ['left'])
    run(world, 5, ['left'])
    expect(world.agent.invuln).toBeGreaterThan(0)
  })

  it('space: giant swing spins two full turns, knocks down enemies on both sides, then flings the held one', () => {
    const { world, g } = grabbed()
    const left = new Grunt(278, 'thug', { passive: true })
    const right = new Grunt(326, 'thug', { passive: true })
    for (const e of [left, right]) e.life.hp = 999
    world.enemies.push(left, right)
    tick(world, ['jump'])
    let sidesSeen = new Set<number>()
    let maxInvuln = 0
    for (let i = 0; i < GRAB.swing.length + 10; i++) {
      tick(world)
      if (g.isGrabbed) sidesSeen.add(Math.sign(g.x - world.agent.x))
      maxInvuln = Math.max(maxInvuln, world.agent.invuln)
      expect(world.agent.h).toBe(0) // 空白是大風車，不是跳
    }
    expect(sidesSeen.has(1) && sidesSeen.has(-1)).toBe(true)
    expect(999 - left.life.hp).toBe(GRAB_HITS.swingSweep.damage)
    expect(999 - right.life.hp).toBe(GRAB_HITS.swingSweep.damage)
    expect(lost(g)).toBe(GRAB_HITS.swingRelease.damage)
    expect(maxInvuln).toBeGreaterThan(0)
    expect(g.isGrabbed).toBe(false)
  })

  it('every grab move returns you to normal control afterwards', () => {
    for (const [pressed, held] of [[['kick'], []], [['kick'], ['left']], [['jump'], []]] as [Button[], Button[]][]) {
      const { world } = grabbed()
      tick(world, pressed, held)
      run(world, 70)
      const x0 = world.agent.x
      run(world, 20, ['right'])
      expect(world.agent.x).toBeGreaterThan(x0 + 20)
    }
  })

  it('grab hits count toward the combo and score', () => {
    const { world } = grabbed()
    const score0 = world.score
    tick(world, ['punch'])
    run(world, GRAB.knee.length + 2)
    expect(world.score).toBeGreaterThan(score0)
    expect(world.combo.count).toBeGreaterThanOrEqual(1)
  })
})
