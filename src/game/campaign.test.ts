import { describe, expect, it } from 'vitest'
import { VIEW_W } from './constants'
import type { Button } from './input/buttons'
import { newItem } from './items/itemTypes'
import { FLOORS } from './level/floors'
import { World } from './world'

function tick(world: World, pressed: Button[] = [], held: Button[] = []) {
  world.update({ pressed, held: new Set([...held, ...pressed]) })
}

function run(world: World, frames: number, held: Button[] = []) {
  for (let i = 0; i < frames; i++) tick(world, [], held)
}

/** 直接清掉場上所有雜兵（不測打鬥本身）。 */
function wipe(world: World) {
  for (const g of world.enemies) g.removed = true
  world.enemies = []
}

/** 打完目前樓層的所有區段：走到每個區段觸發點，清光每一波。 */
function clearAllZones(world: World) {
  const floor = world.floor!
  for (const zone of floor.zones) {
    world.agent.x = zone.start + VIEW_W / 2
    for (let i = 0; i < 2000 && (world.director!.locked || world.director!.zone !== zone); i++) {
      tick(world)
      wipe(world)
    }
  }
}

function climbStairs(world: World) {
  world.agent.x = world.floor!.stairsX
  tick(world)
}

describe('campaign', () => {
  it('starts on 1F with the floor card, then play', () => {
    const world = new World()
    expect(world.floor?.label).toBe('1F')
    expect(world.phase).toBe('intro')
    run(world, 120)
    expect(world.phase).toBe('play')
  })

  it('places the floor items', () => {
    const world = new World()
    expect(world.items.map((i) => i.item.type)).toEqual(FLOORS[0].items.map(([t]) => t))
  })

  it('reaching a zone locks the camera, spawns enemies, and keeps the agent on screen', () => {
    const world = new World()
    const zone = FLOORS[0].zones[0]
    world.agent.x = zone.start + VIEW_W / 2
    tick(world)
    expect(world.director?.locked).toBe(true)
    expect(world.enemies.length).toBeGreaterThan(0)
    run(world, 30)
    run(world, 200, ['right'])
    expect(world.agent.x).toBeLessThanOrEqual(zone.start + VIEW_W - 8)
  })

  it('enemies that walked on screen cannot leave a locked zone', () => {
    const world = new World()
    const zone = FLOORS[0].zones[0]
    world.agent.x = zone.start + VIEW_W / 2
    run(world, 400)
    for (const g of world.enemies.filter((g) => g.entered)) {
      expect(g.x).toBeGreaterThanOrEqual(zone.start + 8)
      expect(g.x).toBeLessThanOrEqual(zone.start + VIEW_W - 8)
    }
  })

  it('stairs do nothing until every zone is cleared', () => {
    const world = new World()
    run(world, 120)
    climbStairs(world)
    expect(world.phase).toBe('play')
  })

  it('clearing a floor heals 20%, after the life bonus is counted', () => {
    const world = new World()
    clearAllZones(world)
    world.agent.life.damage(world.agent.life.max - 90)
    climbStairs(world)
    expect(world.clearBonus.life).toBe(90 * 20)
    expect(world.agent.life.hp).toBe(110)
    expect(world.agent.life.barsRemaining).toBe(2) // 從紅條補回黃條
  })

  it('the floor-clear heal never goes above full', () => {
    const world = new World()
    clearAllZones(world)
    world.agent.life.damage(5)
    climbStairs(world)
    expect(world.agent.life.hp).toBe(world.agent.life.max)
  })

  it('clearing every zone then taking the stairs scores a bonus and moves to 2F, keeping life and item', () => {
    const world = new World()
    clearAllZones(world)
    world.agent.life.damage(50)
    world.agent.held = newItem('katana', 3)
    const before = world.score
    climbStairs(world)
    expect(world.phase).toBe('clear')
    expect(world.clearBonus.life).toBe((world.agent.life.max - 50) * 20)
    expect(world.score).toBe(before + world.clearBonus.life + world.clearBonus.time)

    run(world, 210)
    expect(world.floor?.label).toBe('2F')
    expect(world.phase).toBe('intro')
    expect(world.agent.life.hp).toBe(world.agent.life.max - 50 + 20)
    expect(world.agent.held).toEqual({ type: 'katana', uses: 3 })
    expect(world.agent.x).toBe(40)
  })

  it('a slower clear earns a smaller time bonus', () => {
    const fast = new World()
    clearAllZones(fast)
    climbStairs(fast)

    const slow = new World()
    clearAllZones(slow)
    run(slow, 60 * 60)
    climbStairs(slow)
    expect(slow.clearBonus.time).toBeLessThan(fast.clearBonus.time)
  })

  it('clearing 3F completes the mission; z then restarts', () => {
    const world = new World({ startFloor: 2 })
    expect(world.floor?.label).toBe('3F')
    clearAllZones(world)
    climbStairs(world)
    run(world, 210)
    expect(world.phase).toBe('complete')
    run(world, 61)
    tick(world, ['punch'])
    expect(world.restartRequested).toBe(true)
  })
})
