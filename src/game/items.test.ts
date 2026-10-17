import { describe, expect, it } from 'vitest'
import { Grunt } from './enemies/grunt'
import type { Button } from './input/buttons'
import { ItemEntity } from './items/itemEntity'
import { newItem } from './items/itemTypes'
import { World } from './world'

function setup(gaps: number[] = [14]) {
  const world = new World({ mode: 'sandbox' })
  world.agent.x = 300
  const grunts = gaps.map((g) => new Grunt(300 + g, 'heavy', { passive: true, held: null }))
  world.enemies = grunts
  return { world, agent: world.agent, grunts, grunt: grunts[0] }
}

function tick(world: World, pressed: Button[] = [], held: Button[] = []) {
  world.update({ pressed, held: new Set([...held, ...pressed]) })
}

function run(world: World, frames: number, held: Button[] = []) {
  for (let i = 0; i < frames; i++) tick(world, [], held)
}

const damageOf = (g: Grunt) => g.life.max - g.life.hp

describe('picking up', () => {
  it('c picks up the item at your feet', () => {
    const { world, agent } = setup([200])
    world.placeItem('bat', 302)
    tick(world, ['grab'])
    run(world, 12)
    expect(agent.held?.type).toBe('bat')
    expect(world.items).toHaveLength(0)
  })

  it('c does nothing when nothing is in reach', () => {
    const { world, agent } = setup([200])
    world.placeItem('bat', 340)
    tick(world, ['grab'])
    run(world, 12)
    expect(agent.held).toBeNull()
  })

  it('ammo tops up the gun you are holding', () => {
    const { world, agent } = setup([200])
    agent.held = newItem('pistol', 2)
    world.placeItem('ammo', 300)
    tick(world, ['grab'])
    run(world, 12)
    expect(agent.held?.type).toBe('pistol')
    expect(agent.held?.uses).toBe(6)
  })

  it('ammo cannot be picked up without a gun', () => {
    const { world, agent } = setup([200])
    world.placeItem('ammo', 300)
    tick(world, ['grab'])
    run(world, 12)
    expect(agent.held).toBeNull()
    expect(world.items).toHaveLength(1)
  })
})

describe('melee weapons', () => {
  it('z swings the bat and a hit costs one durability', () => {
    const { world, agent, grunt } = setup([18])
    agent.held = newItem('bat')
    tick(world, ['punch'])
    run(world, 30)
    expect(damageOf(grunt)).toBe(14)
    expect(agent.held?.uses).toBe(9)
  })

  it('a whiff costs no durability', () => {
    const { world, agent } = setup([200])
    agent.held = newItem('bat')
    tick(world, ['punch'])
    run(world, 30)
    expect(agent.held?.uses).toBe(10)
  })

  it('the weapon breaks on its last hit', () => {
    const { world, agent, grunt } = setup([18])
    agent.held = newItem('katana', 1)
    tick(world, ['punch'])
    run(world, 30)
    expect(damageOf(grunt)).toBe(22)
    expect(agent.held).toBeNull()
  })

  it('holding a weapon disables special moves: z + x just swings, no life cost', () => {
    const { world, agent, grunt } = setup([18])
    agent.held = newItem('bat')
    tick(world, ['punch', 'kick'])
    run(world, 40)
    expect(agent.life.hp).toBe(agent.life.max)
    expect(damageOf(grunt)).toBe(14)
  })

  it('x still kicks while holding a weapon', () => {
    const { world, agent, grunt } = setup([14])
    agent.held = newItem('bat')
    tick(world, ['kick'])
    run(world, 30)
    expect(damageOf(grunt)).toBe(10)
    expect(agent.held?.uses).toBe(10)
  })
})

describe('firearms', () => {
  it('the pistol shoots a grunt across the room and uses a bullet', () => {
    const { world, agent, grunt } = setup([150])
    agent.held = newItem('pistol')
    tick(world, ['punch'])
    run(world, 60)
    expect(damageOf(grunt)).toBe(12)
    expect(agent.held?.uses).toBe(7)
  })

  it('the shotgun hits once per target even with three pellets', () => {
    const { world, agent, grunt } = setup([60])
    agent.held = newItem('shotgun')
    tick(world, ['punch'])
    run(world, 60)
    expect(damageOf(grunt)).toBe(20)
    expect(agent.held?.uses).toBe(3)
  })

  it('an empty gun bashes with the stock instead', () => {
    const { world, agent, grunt } = setup([14])
    agent.held = newItem('pistol', 0)
    tick(world, ['punch'])
    run(world, 30)
    expect(world.bullets).toHaveLength(0)
    expect(damageOf(grunt)).toBe(6)
  })
})

describe('throwing', () => {
  it('c throws the held chair; it breaks on the grunt', () => {
    const { world, agent, grunt } = setup([60])
    agent.held = newItem('chair')
    tick(world, ['grab'])
    run(world, 60)
    expect(agent.held).toBeNull()
    expect(damageOf(grunt)).toBe(14)
    expect(world.items).toHaveLength(0)
  })

  it('z also throws a throwable', () => {
    const { world, agent, grunt } = setup([60])
    agent.held = newItem('chair')
    tick(world, ['punch'])
    run(world, 60)
    expect(damageOf(grunt)).toBe(14)
  })

  it('a thrown knife flies straight, hits, and can be picked up again', () => {
    const { world, agent, grunt } = setup([150])
    agent.held = newItem('knife')
    tick(world, ['grab'])
    run(world, 90)
    expect(damageOf(grunt)).toBe(16)
    expect(world.items).toHaveLength(1)
    expect(world.items[0].pickable).toBe(true)
  })

  it('a thrown cabinet keeps flying after a hit (pierces) while a chair shatters', () => {
    const { world, agent } = setup([200])
    const cabinet = ItemEntity.thrown(newItem('cabinet'), agent)
    cabinet.onHitLanded(world)
    expect(cabinet.removed).toBe(false)
    expect(cabinet.activeHit()).not.toBeNull()

    const chair = ItemEntity.thrown(newItem('chair'), agent)
    chair.onHitLanded(world)
    expect(chair.removed).toBe(true)
  })

  it('a thrown cabinet hits for 22', () => {
    const { world, agent, grunt } = setup([40])
    agent.held = newItem('cabinet')
    tick(world, ['grab'])
    run(world, 60)
    expect(damageOf(grunt)).toBe(22)
  })

  it('carrying a cabinet slows you and stops you from jumping', () => {
    const { world, agent } = setup([400])
    agent.held = newItem('cabinet')
    run(world, 20, ['right'])
    expect(agent.x).toBeLessThan(300 + 20 * 1.5 * 0.6)
    tick(world, ['jump'])
    run(world, 5)
    expect(agent.h).toBe(0)
  })
})

describe('dropping', () => {
  it('the agent drops the held item when knocked down', () => {
    const world = new World({ mode: 'sandbox' })
    world.agent.x = 300
    world.agent.held = newItem('bat')
    world.enemies = [new Grunt(318, 'heavy', { moves: ['slam'], held: null })]
    for (let i = 0; i < 600 && world.agent.held; i++) tick(world)
    expect(world.agent.held).toBeNull()
    expect(world.items.some((i) => i.item.type === 'bat')).toBe(true)
  })

  it('a knocked-down grunt drops its weapon', () => {
    const world = new World({ mode: 'sandbox' })
    world.agent.x = 300
    const grunt = new Grunt(314, 'bruiser', { passive: true, held: newItem('crowbar') })
    world.enemies = [grunt]
    for (let i = 0; i < 6; i++) {
      tick(world, ['punch'])
      run(world, 7)
    }
    run(world, 30)
    expect(grunt.held).toBeNull()
    expect(world.items.some((i) => i.item.type === 'crowbar')).toBe(true)
  })
})

describe('armed enemies', () => {
  it('a gunman shoots a standing agent from range', () => {
    const world = new World({ mode: 'sandbox' })
    world.agent.x = 300
    world.enemies = [new Grunt(450, 'gunman', { held: newItem('pistol', 8) })]
    run(world, 400)
    expect(world.agent.life.hp).toBeLessThan(world.agent.life.max)
  })

  it('crouching ducks under bullets', () => {
    const world = new World({ mode: 'sandbox' })
    world.agent.x = 300
    const gunman = new Grunt(450, 'gunman', { held: newItem('pistol', 8) })
    world.enemies = [gunman]
    run(world, 300, ['down'])
    expect(gunman.held?.uses).toBeLessThan(8)
    expect(world.agent.life.hp).toBe(world.agent.life.max)
  })

  it('an unarmed bruiser walks over and picks up a bat', () => {
    const world = new World({ mode: 'sandbox' })
    world.agent.x = 100
    const bruiser = new Grunt(300, 'bruiser', { held: null })
    world.enemies = [bruiser]
    world.placeItem('bat', 380)
    for (let i = 0; i < 400 && !bruiser.held; i++) tick(world)
    expect(bruiser.held?.type).toBe('bat')
  })

  it('a heavy picks up a chair and throws it at the agent', () => {
    const world = new World({ mode: 'sandbox' })
    world.agent.x = 150
    const heavy = new Grunt(300, 'heavy', { held: null, moves: ['jab'] })
    world.enemies = [heavy]
    world.placeItem('chair', 330)
    let picked = false
    for (let i = 0; i < 900; i++) {
      tick(world)
      if (heavy.held?.type === 'chair') picked = true
      if (picked && !heavy.held) break
    }
    expect(picked).toBe(true)
    expect(heavy.held).toBeNull()
  })
})
