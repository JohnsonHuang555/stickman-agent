import { describe, expect, it } from 'vitest'
import { MOVES } from './agent/moves'
import { Grunt } from './enemies/grunt'
import type { Button } from './input/buttons'
import { CROUCH_HEIGHT } from './stickman/pose'
import { POSES } from './stickman/poses'
import { World } from './world'

function arena(gap = 16) {
  const world = new World({ mode: 'sandbox' })
  world.agent.x = 300
  const grunt = new Grunt(300 + gap, 'heavy', { passive: true })
  world.enemies = [grunt]
  return { world, grunt }
}

function tick(world: World, pressed: Button[] = [], held: Button[] = []) {
  world.update({ pressed, held: new Set([...held, ...pressed]) })
}

const sameLimb = (a: readonly number[], b: readonly number[]) => a[0] === b[0] && a[1] === b[1]

describe('crouching attacks (regression for "crouch punch moves the legs" / "crouch kick stands up")', () => {
  it('↓+Z is a crouch punch: legs stay in the crouch the whole time and it hits for 5', () => {
    const { world, grunt } = arena()
    for (let i = 0; i < 2; i++) tick(world, [], ['down'])
    tick(world, ['punch'], ['down'])
    for (let i = 0; i < MOVES.crouchPunch.length; i++) {
      const p = world.agent.pose()
      expect(sameLimb(p.legF, POSES.crouch.legF) && sameLimb(p.legB, POSES.crouch.legB)).toBe(true)
      const box = world.agent.hurtbox()!
      expect(box.h).toBeLessThanOrEqual(CROUCH_HEIGHT)
      tick(world, [], ['down'])
    }
    for (let i = 0; i < 20; i++) tick(world, [], ['down'])
    expect(grunt.life.max - grunt.life.hp).toBe(5)
  })

  it('↓+X sweeps without standing up', () => {
    const { world, grunt } = arena()
    for (let i = 0; i < 2; i++) tick(world, [], ['down'])
    tick(world, ['kick'], ['down'])
    for (let i = 0; i < MOVES.sweep.length; i++) {
      expect(world.agent.hurtbox()!.h).toBeLessThanOrEqual(CROUCH_HEIGHT)
      // 後腳（支撐腳）一直是蹲姿的樣子
      expect(sameLimb(world.agent.pose().legB, POSES.crouch.legB)).toBe(true)
      tick(world, [], ['down'])
    }
    for (let i = 0; i < 20; i++) tick(world, [], ['down'])
    expect(grunt.life.max - grunt.life.hp).toBe(8)
  })
})

/** 起跳後追蹤：有沒有離地、有沒有出現某個空中招式的姿勢。 */
function trace(world: World, frames: number, held: Button[] = []) {
  let maxH = 0
  const poses = []
  for (let i = 0; i < frames; i++) {
    tick(world, [], held)
    maxH = Math.max(maxH, world.agent.h)
    poses.push(world.agent.pose())
  }
  return { maxH, poses }
}

const reached = (poses: ReturnType<World['agent']['pose']>[], def: { clip: { sample(f: number): unknown } }, frame: number) =>
  poses.some((p) => JSON.stringify(p) === JSON.stringify(def.clip.sample(frame)))

describe('jump + attack pressed together jumps first (regression for "jump+X does a ground kick")', () => {
  it('space + X on the same frame jumps and air-kicks', () => {
    const world = new World({ mode: 'sandbox' })
    world.enemies = []
    tick(world, ['jump', 'kick'])
    const { maxH, poses } = trace(world, 20)
    expect(maxH).toBeGreaterThan(20)
    expect(reached(poses, MOVES.airKick, 6)).toBe(true)
  })

  it('X a frame before space still jumps and air-kicks', () => {
    const world = new World({ mode: 'sandbox' })
    world.enemies = []
    tick(world, ['kick'])
    tick(world, ['jump'], ['kick'])
    const { maxH, poses } = trace(world, 20)
    expect(maxH).toBeGreaterThan(20)
    expect(reached(poses, MOVES.airKick, 6)).toBe(true)
  })

  it('→ + space + X flies forward with a flying kick', () => {
    const world = new World({ mode: 'sandbox' })
    world.enemies = []
    const x0 = world.agent.x
    tick(world, ['jump', 'kick'], ['right'])
    const { maxH, poses } = trace(world, 20, ['right'])
    expect(maxH).toBeGreaterThan(10)
    expect(reached(poses, MOVES.flyingKick, 30)).toBe(true)
    expect(world.agent.x - x0).toBeGreaterThan(40)
  })

  it('space + Z jumps and air-punches', () => {
    const world = new World({ mode: 'sandbox' })
    world.enemies = []
    tick(world, ['jump', 'punch'])
    const { maxH, poses } = trace(world, 12)
    expect(maxH).toBeGreaterThan(10)
    expect(reached(poses, MOVES.airPunch1, 3)).toBe(true)
  })

  it('a plain kick without jump stays on the ground', () => {
    const world = new World({ mode: 'sandbox' })
    world.enemies = []
    tick(world, ['kick'])
    const { maxH } = trace(world, 20)
    expect(maxH).toBe(0)
  })
})
