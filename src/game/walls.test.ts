import { describe, expect, it } from 'vitest'
import type { HitSpec } from './combat/types'
import { GROUND_Y, VIEW_W } from './constants'
import { Grunt } from './enemies/grunt'
import type { Button } from './input/buttons'
import { FLOORS } from './level/floors'
import { posePoints, spinPivot } from './stickman/pose'
import { POSES } from './stickman/poses'
import { World } from './world'

function tick(world: World, pressed: Button[] = [], held: Button[] = []) {
  world.update({ pressed, held: new Set([...held, ...pressed]) })
}

function run(world: World, frames: number, held: Button[] = []) {
  for (let i = 0; i < frames; i++) tick(world, [], held)
}

function sandbox(x = 300) {
  const world = new World({ mode: 'sandbox' })
  world.agent.x = x
  return { world, agent: world.agent }
}

const KNOCKDOWN: HitSpec = { from: 0, to: 0, box: { forward: 0, up: 0, w: 1, h: 1 }, damage: 1, hitstun: 20, knockback: 3, knockdown: true }

describe('roll (↓ + space)', () => {
  it('rolls forward about 60px instead of jumping', () => {
    const { world, agent } = sandbox()
    tick(world, ['jump'], ['down'])
    let maxH = 0
    for (let i = 0; i < 30; i++) {
      tick(world, [], ['down'])
      maxH = Math.max(maxH, agent.h)
    }
    expect(maxH).toBe(0)
    expect(agent.x - 300).toBeGreaterThan(45)
    expect(agent.x - 300).toBeLessThan(80)
  })

  it('rolls toward the held direction', () => {
    const { world, agent } = sandbox()
    tick(world, ['jump'], ['down', 'left'])
    run(world, 25, ['down'])
    expect(agent.facing).toBe(-1)
    expect(agent.x).toBeLessThan(260)
  })

  it('is invulnerable and low for most of the roll, then turns upright again', () => {
    const { world, agent } = sandbox()
    tick(world, ['jump'], ['down'])
    run(world, 6)
    expect(agent.invuln).toBeGreaterThan(0)
    expect(agent.hurtbox()!.h).toBeLessThan(35)
    expect(agent.rotation).not.toBe(0)
    run(world, 30)
    expect(agent.invuln).toBe(0)
    expect(agent.rotation).toBe(0)
  })

  it('rolling through an attacking heavy takes no damage', () => {
    const { world, agent } = sandbox(300)
    const heavy = new Grunt(330, 'heavy', { moves: ['slam'], held: null })
    world.enemies = [heavy]
    for (let i = 0; i < 400 && !heavy.attacking; i++) tick(world)
    expect(heavy.attacking).toBe(true)
    run(world, 12) // 等重砸快落下時才滾
    tick(world, ['jump'], ['down', 'right'])
    run(world, 20, ['down'])
    expect(agent.life.hp).toBe(agent.life.max)
    expect(agent.x).toBeGreaterThan(heavy.x) // 滾到壯漢身後
  })
})

describe('wall jump', () => {
  /** 跳起來貼到左邊的牆（樓層左端 x = 8）。 */
  function jumpToLeftWall() {
    const { world, agent } = sandbox(40)
    tick(world, ['jump'], ['left'])
    for (let i = 0; i < 30 && agent.x > 8; i++) tick(world, [], ['left'])
    expect(agent.airborne).toBe(true)
    return { world, agent }
  }

  it('pressing jump while touching a wall in the air kicks off it the other way', () => {
    const { world, agent } = jumpToLeftWall()
    const vhBefore = agent.vh
    tick(world, ['jump'])
    expect(agent.facing).toBe(1)
    expect(agent.vx).toBeGreaterThan(2)
    expect(agent.vh).toBeGreaterThan(vhBefore)
    run(world, 10)
    expect(agent.x).toBeGreaterThan(30)
  })

  it('cannot kick off the same wall twice in a row', () => {
    const { world, agent } = jumpToLeftWall()
    tick(world, ['jump'])
    for (let i = 0; i < 20 && agent.x > 8; i++) tick(world, [], ['left'])
    const vh = agent.vh
    tick(world, ['jump'], ['left'])
    expect(agent.vh).toBeLessThanOrEqual(vh)
  })

  it('there is no double jump away from walls', () => {
    const { world, agent } = sandbox(300)
    tick(world, ['jump'])
    run(world, 10)
    const vh = agent.vh
    tick(world, ['jump'])
    expect(agent.vh).toBeLessThanOrEqual(vh)
  })
})

describe('wall bounce', () => {
  it('a grunt knocked into the wall bounces back, takes extra damage, and can be juggled', () => {
    const { world } = sandbox(1380)
    const grunt = new Grunt(1415, 'thug', { passive: true })
    grunt.life.hp = 999
    world.enemies = [grunt]
    grunt.receiveHit(KNOCKDOWN, 1, world)
    let bouncedAt = -1
    for (let i = 0; i < 30 && bouncedAt < 0; i++) {
      tick(world)
      if (grunt.vx < 0) bouncedAt = i
    }
    expect(bouncedAt).toBeGreaterThanOrEqual(0)
    expect(999 - grunt.life.hp).toBe(1 + 6)
    expect(grunt.juggled).toBe(true)
    expect(world.combo.count).toBe(1)
  })

  it('only bounces once per flight', () => {
    const { world } = sandbox(1380)
    const grunt = new Grunt(1415, 'thug', { passive: true })
    grunt.life.hp = 999
    world.enemies = [grunt]
    grunt.receiveHit(KNOCKDOWN, 1, world)
    run(world, 6)
    // 撞牆後再被打回牆邊
    grunt.vx = 3
    run(world, 20)
    expect(999 - grunt.life.hp).toBe(1 + 6)
  })

  it('a slow push into the wall does not bounce', () => {
    const { world } = sandbox(1380)
    const grunt = new Grunt(1430, 'thug', { passive: true })
    grunt.life.hp = 999
    world.enemies = [grunt]
    grunt.receiveHit({ ...KNOCKDOWN, knockdown: false, knockback: 0.8 }, 1, world)
    run(world, 20)
    expect(999 - grunt.life.hp).toBe(1)
  })

  it('the edges of a locked zone count as walls', () => {
    const world = new World()
    const zone = FLOORS[0].zones[0]
    world.agent.x = zone.start + VIEW_W / 2
    tick(world)
    expect(world.director?.locked).toBe(true)
    const right = zone.start + VIEW_W - 8
    const grunt = new Grunt(right - 20, 'thug', { passive: true })
    grunt.life.hp = 999
    grunt.entered = true
    world.enemies = [grunt]
    grunt.receiveHit(KNOCKDOWN, 1, world)
    run(world, 20)
    expect(999 - grunt.life.hp).toBe(1 + 6)
    expect(grunt.x).toBeLessThanOrEqual(right)
  })
})

describe('roll looks grounded (regression for "the body leaves the ground while rolling")', () => {
  /**
   * 用與 Fighter.draw 完全相同的軸心與轉換，把縮身姿勢轉一整圈，
   * 回傳每個角度下身體最低點離地的高度（正值＝懸空、負值＝陷進地面）與最高點的高度。
   */
  function spin(facing: 1 | -1) {
    const x = 100
    const footY = GROUND_Y
    const screen = posePoints(POSES.tuck).map(([px, up]): [number, number] => [x + px * facing, footY - up])
    const gaps: number[] = []
    let tallest = 0
    for (let step = 0; step < 72; step++) {
      const a = (step / 72) * Math.PI * 2
      const { pivotX, pivotY, lift } = spinPivot(POSES.tuck, x, footY, facing, 1, a, true)
      const ys = screen.map(([sx, sy]) => {
        // canvas：translate(0, -lift) → translate(pivot) → rotate(a) → translate(-pivot)
        const dx = sx - pivotX
        const dy = sy - pivotY
        return pivotY + dx * Math.sin(a) + dy * Math.cos(a) - lift
      })
      gaps.push(footY - Math.max(...ys))
      tallest = Math.max(tallest, footY - Math.min(...ys))
    }
    return { gaps, tallest }
  }

  it('never sinks into the floor while rolling', () => {
    for (const facing of [1, -1] as const) {
      expect(Math.min(...spin(facing).gaps)).toBeGreaterThan(-1)
    }
  })

  it('stays in contact with the ground at every angle (no floating)', () => {
    for (const facing of [1, -1] as const) {
      expect(Math.max(...spin(facing).gaps)).toBeLessThan(0.5)
    }
  })

  it('stays a low ball (well under standing height)', () => {
    expect(spin(1).tallest).toBeLessThan(34)
  })
})
