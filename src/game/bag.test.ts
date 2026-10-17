import { describe, expect, it } from 'vitest'
import { Grunt } from './enemies/grunt'
import type { Button } from './input/buttons'
import { newItem } from './items/itemTypes'
import { World } from './world'

function tick(world: World, pressed: Button[] = [], held: Button[] = []) {
  world.update({ pressed, held: new Set([...held, ...pressed]) })
}

function run(world: World, frames: number, held: Button[] = []) {
  for (let i = 0; i < frames; i++) tick(world, [], held)
}

function sandbox() {
  const world = new World({ mode: 'sandbox' })
  world.agent.x = 300
  return { world, agent: world.agent }
}

describe('bag: guns', () => {
  it('V puts the gun in your hand into the empty bag', () => {
    const { world, agent } = sandbox()
    agent.held = newItem('pistol', 5)
    tick(world, ['bag'])
    expect(agent.held).toBeNull()
    expect(agent.bag).toEqual({ type: 'pistol', uses: 5 })
  })

  it('V takes the gun back out', () => {
    const { world, agent } = sandbox()
    agent.bag = newItem('pistol', 5)
    tick(world, ['bag'])
    expect(agent.held).toEqual({ type: 'pistol', uses: 5 })
    expect(agent.bag).toBeNull()
  })

  it('drawing the gun while holding another weapon drops that weapon on the floor', () => {
    const { world, agent } = sandbox()
    agent.held = newItem('bat', 7)
    agent.bag = newItem('pistol', 5)
    tick(world, ['bag'])
    run(world, 40)
    expect(agent.held?.type).toBe('pistol')
    expect(agent.bag).toBeNull()
    expect(world.items.map((i) => i.item)).toContainEqual({ type: 'bat', uses: 7 })
  })

  it('a gun in hand and a gun in the bag swap places', () => {
    const { world, agent } = sandbox()
    agent.held = newItem('pistol', 2)
    agent.bag = newItem('shotgun', 4)
    tick(world, ['bag'])
    expect(agent.held).toEqual({ type: 'shotgun', uses: 4 })
    expect(agent.bag).toEqual({ type: 'pistol', uses: 2 })
  })

  it('with a gun in the bag you can still pick up a weapon', () => {
    const { world, agent } = sandbox()
    agent.bag = newItem('pistol', 5)
    world.placeItem('katana', 302)
    tick(world, ['grab'])
    run(world, 12)
    expect(agent.held?.type).toBe('katana')
    expect(agent.bag?.type).toBe('pistol')
  })

  it('ammo goes to the gun in your hand first, otherwise to the gun in the bag', () => {
    const { world, agent } = sandbox()
    agent.held = newItem('bat')
    agent.bag = newItem('pistol', 1)
    world.placeItem('ammo', 300)
    tick(world, ['grab'])
    run(world, 12)
    expect(agent.bag?.uses).toBe(5)
    expect(agent.held?.type).toBe('bat')

    const second = sandbox()
    second.agent.held = newItem('pistol', 1)
    second.agent.bag = newItem('shotgun', 1)
    second.world.placeItem('ammo', 300)
    tick(second.world, ['grab'])
    run(second.world, 12)
    expect(second.agent.held?.uses).toBe(5)
    expect(second.agent.bag?.uses).toBe(1)
  })

  it('V works in the air', () => {
    const { world, agent } = sandbox()
    agent.held = newItem('pistol', 5)
    tick(world, ['jump'])
    run(world, 4)
    tick(world, ['bag'])
    expect(agent.airborne).toBe(true)
    expect(agent.bag?.type).toBe('pistol')
  })

  it('getting knocked down drops what is in your hand but keeps the bag', () => {
    const world = new World({ mode: 'sandbox' })
    world.agent.x = 300
    world.agent.held = newItem('bat')
    world.agent.bag = newItem('pistol', 3)
    world.enemies = [new Grunt(318, 'heavy', { moves: ['slam'], held: null })]
    for (let i = 0; i < 600 && world.agent.held; i++) tick(world)
    expect(world.agent.held).toBeNull()
    expect(world.agent.bag).toEqual({ type: 'pistol', uses: 3 })
  })
})

describe('bag: medkits', () => {
  it('walking onto a medkit with an empty bag stores it instead of healing', () => {
    const { world, agent } = sandbox()
    agent.life.damage(50)
    world.placeItem('medkit', 300)
    tick(world)
    expect(agent.bag?.type).toBe('medkit')
    expect(agent.life.hp).toBe(150)
  })

  it('an empty bag stores a medkit even at full life', () => {
    const { world, agent } = sandbox()
    world.placeItem('medkit', 300)
    tick(world)
    expect(agent.bag?.type).toBe('medkit')
  })

  it('V uses the medkit: heals 40% and empties the bag', () => {
    const { world, agent } = sandbox()
    agent.life.damage(130)
    agent.bag = newItem('medkit')
    tick(world, ['bag'])
    expect(agent.life.hp).toBe(110)
    expect(agent.bag).toBeNull()
  })

  it('V does not waste the medkit at full life', () => {
    const { world, agent } = sandbox()
    agent.bag = newItem('medkit')
    tick(world, ['bag'])
    expect(agent.bag?.type).toBe('medkit')
  })

  it('a medkit in the bag does not stop you from holding a gun', () => {
    const { world, agent } = sandbox()
    agent.bag = newItem('medkit')
    world.placeItem('pistol', 302)
    tick(world, ['grab'])
    run(world, 12)
    expect(agent.held?.type).toBe('pistol')
    // 背包已經有醫療箱，按 V 會用醫療箱而不是收槍（滿血時什麼都不做）
    tick(world, ['bag'])
    expect(agent.held?.type).toBe('pistol')
    expect(agent.bag?.type).toBe('medkit')
  })
})
