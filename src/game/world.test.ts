import { describe, expect, it } from 'vitest'
import { Grunt } from './enemies/grunt'
import type { Button } from './input/buttons'
import { World } from './world'

/** 建一個只有一個雜兵、站在特務正前方的世界。 */
function arena(gap = 14) {
  const world = new World()
  world.agent.x = 300
  const grunt = new Grunt(300 + gap, 'heavy')
  world.grunts = [grunt]
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
    world.grunts = []
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

  it('z + x costs the agent life and hits', () => {
    const { world, grunt } = arena()
    tick(world, ['punch', 'kick'])
    run(world, 40)
    expect(world.agent.life.hp).toBe(192)
    expect(grunt.life.max - grunt.life.hp).toBe(12)
  })

  it('a punch cancelled by x within the window becomes the desperation move', () => {
    const { world, grunt } = arena()
    tick(world, ['punch'])
    run(world, 2)
    tick(world, ['kick'])
    run(world, 40)
    expect(world.agent.life.hp).toBe(192)
    expect(grunt.life.max - grunt.life.hp).toBe(12)
  })

  it('jumping leaves the ground and lands again', () => {
    const { world } = arena()
    world.grunts = []
    tick(world, ['jump'])
    run(world, 5)
    expect(world.agent.h).toBeGreaterThan(0)
    run(world, 60)
    expect(world.agent.h).toBe(0)
  })

  it('a flying kick connects from the air', () => {
    const { world, grunt } = arena(40)
    tick(world, ['jump'])
    run(world, 8)
    tick(world, ['kick'])
    run(world, 60)
    expect(grunt.life.max - grunt.life.hp).toBe(12)
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
    const behind = new Grunt(350, 'heavy')
    world.grunts.push(behind)
    for (let i = 0; i < 6; i++) {
      tick(world, ['punch'])
      run(world, 7)
    }
    run(world, 60)
    expect(grunt.life.max - grunt.life.hp).toBe(23)
    expect(behind.life.hp).toBeLessThan(behind.life.max)
  })
})
