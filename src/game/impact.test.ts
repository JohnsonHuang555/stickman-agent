import { describe, expect, it } from 'vitest'
import { VIEW_W } from './constants'
import { Grunt } from './enemies/grunt'
import type { Button } from './input/buttons'
import { FLOORS } from './level/floors'
import { ImpactFx, SPARK_FRAMES, ZOOM_IN_FRAMES, ZOOM_OUT_FRAMES } from './render/impact'
import { World } from './world'

function tick(world: World, pressed: Button[] = [], held: Button[] = []) {
  world.update({ pressed, held: new Set([...held, ...pressed]) })
}
function run(world: World, frames: number, held: Button[] = []) {
  for (let i = 0; i < frames; i++) tick(world, [], held)
}

function arena(gap = 14) {
  const world = new World({ mode: 'sandbox' })
  world.agent.x = 300
  const grunt = new Grunt(300 + gap, 'heavy', { passive: true })
  world.enemies = [grunt]
  return { world, grunt }
}

describe('impact sparks', () => {
  it('a punch puts one light spark on the enemy, and it fades out after SPARK_FRAMES even through hit-stop', () => {
    const { world, grunt } = arena()
    tick(world, ['punch'])
    let spark = world.fx.sparks[0]
    for (let i = 0; i < 10 && !spark; i++) {
      tick(world)
      spark = world.fx.sparks[0]
    }
    expect(world.fx.sparks).toHaveLength(1)
    expect(spark.heavy).toBe(false)
    expect(spark.hurt).toBe(false)
    const box = grunt.hurtbox()!
    expect(spark.x).toBeGreaterThanOrEqual(box.x - 1)
    expect(spark.x).toBeLessThanOrEqual(box.x + box.w + 1)
    run(world, SPARK_FRAMES.light)
    expect(world.fx.sparks).toHaveLength(0)
  })

  it('the third punch (knockdown) makes a heavy spark', () => {
    const { world } = arena()
    let heavy = false
    for (let i = 0; i < 6; i++) {
      tick(world, ['punch'])
      for (let j = 0; j < 7; j++) {
        heavy ||= world.fx.sparks.some((s) => s.heavy)
        tick(world)
      }
    }
    expect(heavy).toBe(true)
  })

  it('the agent getting hit makes a red (hurt) spark', () => {
    const world = new World({ mode: 'sandbox' })
    world.agent.x = 300
    world.enemies = [new Grunt(318, 'thug', { moves: ['jab'] })]
    let hurt = false
    for (let i = 0; i < 200 && !hurt; i++) {
      tick(world)
      hurt = world.fx.sparks.some((s) => s.hurt)
    }
    expect(hurt).toBe(true)
  })
})

describe('camera push-in', () => {
  it('zooms in, holds, then returns exactly to 1 and never zooms out below 1', () => {
    const fx = new ImpactFx()
    fx.pushIn(100, 200, 0.2, 10, 0)
    const total = ZOOM_IN_FRAMES + 10 + ZOOM_OUT_FRAMES
    const zooms = Array.from({ length: total + 5 }, (_, f) => fx.zoomAmount(f))
    expect(Math.max(...zooms)).toBeCloseTo(1.2)
    expect(Math.min(...zooms)).toBeGreaterThanOrEqual(1)
    expect(zooms[ZOOM_IN_FRAMES + 5]).toBeCloseTo(1.2)
    fx.update(total)
    expect(fx.zoomAmount(total)).toBe(1)
  })

  it('a weaker push-in does not cut off a stronger one already playing', () => {
    const fx = new ImpactFx()
    fx.pushIn(100, 200, 0.22, 30, 0)
    fx.pushIn(100, 200, 0.1, 5, 6)
    expect(fx.zoomAmount(10)).toBeCloseTo(1.22)
  })

  it('a wall bounce pushes the camera in', () => {
    const world = new World({ mode: 'sandbox' })
    world.agent.x = 40
    const g = new Grunt(30, 'heavy', { passive: true })
    g.life.hp = 999
    world.enemies = [g]
    g.receiveHit({ from: 0, to: 0, box: { forward: 0, up: 0, w: 1, h: 1 }, damage: 1, hitstun: 20, knockback: 3, knockdown: true }, -1, world)
    let zoomed = false
    for (let i = 0; i < 30 && !zoomed; i++) {
      tick(world)
      zoomed = world.fx.zoomAmount(world.realFrame) > 1
    }
    expect(zoomed).toBe(true)
  })
})

describe('finishing blow slow motion', () => {
  /** 鎖定第一個區段並推進到最後一波出完，只留一個快死的雜兵。 */
  function lastEnemy() {
    const world = new World()
    const zone = FLOORS[0].zones[0]
    world.agent.x = zone.start + VIEW_W / 2
    tick(world)
    // 把前面的波次清掉，直到最後一波全部出場
    for (let i = 0; i < 3000 && !world.director!.finalWaveOut; i++) {
      for (const e of world.enemies) e.life.damage(9999)
      world.enemies = world.enemies.filter((e) => !e.life.isDead)
      tick(world)
    }
    expect(world.director!.finalWaveOut).toBe(true)
    run(world, 120) // 等最後一波都走進來
    const g = new Grunt(world.agent.x + 14, 'thug', { passive: true })
    g.entered = true
    g.life.hp = 1
    world.enemies = [g]
    world.agent.facing = 1
    return { world, g }
  }

  it('KO-ing the last enemy of the zone slows time down to 1/3, flashes, and zooms; then time runs normally again', () => {
    const { world, g } = lastEnemy()
    tick(world, ['punch'])
    for (let i = 0; i < 10 && world.slowmo === 0; i++) tick(world)
    expect(g.life.isDead).toBe(true)
    expect(world.slowmo).toBeGreaterThan(0)
    expect(world.fx.zoomAmount(world.realFrame + 4)).toBeGreaterThan(1.15)

    // 慢動作期間：遊戲每 3 個實際幀才推進 1 幀
    run(world, 10) // 先等頓幀結束
    const before = world.floorFrames
    run(world, 30)
    expect(world.floorFrames - before).toBe(10)
    run(world, 80)
    expect(world.slowmo).toBe(0)
    const after = world.floorFrames
    run(world, 30)
    expect(world.floorFrames - after).toBe(30)
  })

  it('KO-ing an enemy while others are still standing does not slow time', () => {
    const { world, g } = lastEnemy()
    const other = new Grunt(world.agent.x - 60, 'thug', { passive: true })
    other.entered = true
    world.enemies = [g, other]
    tick(world, ['punch'])
    run(world, 10)
    expect(g.life.isDead).toBe(true)
    expect(world.slowmo).toBe(0)
  })

  it('sandbox KOs never slow time (no zone to clear)', () => {
    const { world, grunt } = arena()
    grunt.life.hp = 1
    tick(world, ['punch'])
    run(world, 10)
    expect(grunt.life.isDead).toBe(true)
    expect(world.slowmo).toBe(0)
  })
})

