import { describe, expect, it } from 'vitest'
import { MOVES } from './agent/moves'
import { Grunt } from './enemies/grunt'
import type { Button } from './input/buttons'
import { BODY, CROUCH_HEIGHT, posePoints } from './stickman/pose'
import { ATTACK_POSES, POSES } from './stickman/poses'
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

const topOf = (p: Parameters<typeof posePoints>[0]) => Math.max(...posePoints(p).map(([, up]) => up))
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
      // 整個人（含頭）從頭到尾都不比蹲姿高
      expect(topOf(world.agent.pose())).toBeLessThanOrEqual(topOf(POSES.crouch) + 1)
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

describe('crouch attack follow-ups (regression for "crouch punch flashes the standing pose" / "sweep leg does not extend")', () => {
  it('mashing ↓+Z never shows a single standing frame', () => {
    const { world } = arena(60)
    for (let i = 0; i < 2; i++) tick(world, [], ['down'])
    for (let f = 0; f < 80; f++) {
      tick(world, f % 9 === 0 ? ['punch'] : [], ['down'])
      const p = world.agent.pose()
      expect(sameLimb(p.legF, POSES.crouch.legF) && sameLimb(p.legB, POSES.crouch.legB)).toBe(true)
    }
  })

  it('a finished sweep goes straight back to crouching while ↓ is held', () => {
    const { world } = arena(60)
    for (let i = 0; i < 2; i++) tick(world, [], ['down'])
    tick(world, ['kick'], ['down'])
    for (let i = 0; i < MOVES.sweep.length + 5; i++) {
      tick(world, [], ['down'])
      expect(world.agent.hurtbox()!.h).toBeLessThanOrEqual(CROUCH_HEIGHT)
    }
    expect(sameLimb(world.agent.pose().legF, POSES.crouch.legF)).toBe(true)
  })

  it('the sweeping foot reaches far forward, skimming the floor', () => {
    const pts = posePoints(ATTACK_POSES.sweep[1])
    const [footX, footUp] = pts[7]
    expect(footX).toBeGreaterThan((BODY.thigh + BODY.shin) * 0.8) // 整條腿幾乎伸直往前
    expect(footUp).toBeLessThan(3)
  })
})
