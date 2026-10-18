import { describe, expect, it } from 'vitest'
import { MOVES } from './agent/moves'
import { Grunt } from './enemies/grunt'
import type { Button } from './input/buttons'
import { walkPose } from './stickman/poses'
import { World } from './world'

function tick(world: World, pressed: Button[] = [], held: Button[] = []) {
  world.update({ pressed, held: new Set([...held, ...pressed]) })
}
function run(world: World, frames: number, held: Button[] = []) {
  for (let i = 0; i < frames; i++) tick(world, [], held)
}

function sandbox() {
  const world = new World({ mode: 'sandbox' })
  world.items = []
  world.enemies = []
  world.agent.x = 100
  run(world, 5)
  return world
}

/** 點一下 →、放開 gap 幀、再按住 →（人手連按兩下）。 */
function doubleTap(world: World, gap = 6) {
  tick(world, ['right'])
  run(world, 2, ['right'])
  run(world, gap)
  tick(world, ['right'])
}

/** 按住 → 走 frames 幀的距離。 */
function distance(world: World, frames: number) {
  const x0 = world.agent.x
  run(world, frames, ['right'])
  return world.agent.x - x0
}

describe('running (double-tap and hold a direction)', () => {
  it('double-tapping → and holding runs much faster than walking', () => {
    const walk = distance(sandbox(), 30)
    const world = sandbox()
    doubleTap(world)
    const ran = distance(world, 30)
    expect(ran).toBeGreaterThan(walk * 1.6)
  })

  it.each([2, 4, 6, 8, 10])('works at human double-tap speeds (%i frames between taps)', (gap) => {
    const walk = distance(sandbox(), 20)
    const world = sandbox()
    doubleTap(world, gap)
    expect(distance(world, 20)).toBeGreaterThan(walk * 1.5)
  })

  it('a single press is just walking', () => {
    const world = sandbox()
    tick(world, ['right'])
    expect(distance(world, 30)).toBeLessThan(70)
  })

  it('letting go stops the run; pressing again only walks', () => {
    const walk = distance(sandbox(), 20)
    const world = sandbox()
    doubleTap(world)
    run(world, 10, ['right'])
    run(world, 20) // 放開
    tick(world, ['right'])
    expect(distance(world, 20)).toBeLessThan(walk * 1.1)
  })

  it('the running pose leans forward (not the walking pose)', () => {
    const world = sandbox()
    doubleTap(world)
    run(world, 10, ['right'])
    // 比走路明顯往前傾
    expect(world.agent.pose().lean).toBeGreaterThan(walkPose(0).lean + 8)
  })

  it('jumping while running carries the run speed into the jump', () => {
    const jumpFar = (running: boolean) => {
      const world = sandbox()
      if (running) doubleTap(world)
      else tick(world, ['right'])
      run(world, 8, ['right'])
      const x0 = world.agent.x
      tick(world, ['jump'], ['right'])
      run(world, 10, ['right'])
      return world.agent.x - x0
    }
    expect(jumpFar(true)).toBeGreaterThan(jumpFar(false) + 8)
  })
})

describe('attacks out of a run', () => {
  function runningAt(enemyGap: number) {
    const world = sandbox()
    const g = new Grunt(world.agent.x + enemyGap, 'heavy', { passive: true })
    g.life.hp = 999
    world.enemies = [g]
    doubleTap(world)
    run(world, 4, ['right'])
    return { world, g }
  }

  it('Z while running is the dash punch (12 damage, knockdown)', () => {
    const { world, g } = runningAt(90)
    tick(world, ['punch'], ['right'])
    run(world, 40)
    expect(999 - g.life.hp).toBe(MOVES.dashPunch.hit.damage)
  })

  it('X while running is a running flying kick: hops off the ground, flies forward, knocks down for 12', () => {
    const { world, g } = runningAt(110)
    const x0 = world.agent.x
    tick(world, ['kick'], ['right'])
    let maxH = 0
    for (let i = 0; i < 40; i++) {
      tick(world)
      maxH = Math.max(maxH, world.agent.h)
    }
    expect(maxH).toBeGreaterThan(10)
    expect(world.agent.x - x0).toBeGreaterThan(50)
    expect(999 - g.life.hp).toBe(MOVES.runKick.hit.damage)
  })

  it('X while walking (not running) is still the normal standing kick', () => {
    const world = sandbox()
    tick(world, ['right'])
    run(world, 6, ['right'])
    tick(world, ['kick'], ['right'])
    let maxH = 0
    for (let i = 0; i < 25; i++) {
      tick(world)
      maxH = Math.max(maxH, world.agent.h)
    }
    expect(maxH).toBe(0)
  })
})
