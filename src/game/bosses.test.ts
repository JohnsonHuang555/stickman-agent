import { describe, expect, it } from 'vitest'
import type { HitSpec } from './combat/types'
import { VIEW_W } from './constants'
import { Boss } from './enemies/boss'
import { BOSSES, type BossId } from './enemies/bosses'
import { Grunt } from './enemies/grunt'
import type { Button } from './input/buttons'
import { FLOORS } from './level/floors'
import { World } from './world'

function tick(world: World, pressed: Button[] = [], held: Button[] = []) {
  world.update({ pressed, held: new Set([...held, ...pressed]) })
}

function run(world: World, frames: number, held: Button[] = []) {
  for (let i = 0; i < frames; i++) tick(world, [], held)
}

const JAB: HitSpec = { from: 0, to: 0, box: { forward: 0, up: 0, w: 1, h: 1 }, damage: 6, hitstun: 16, knockback: 0.4 }

function arena(id: BossId, gap = 30) {
  const world = new World({ mode: 'sandbox' })
  world.agent.x = 300
  world.spawn({ boss: id, side: 'right' })
  const boss = world.boss!
  boss.x = 300 + gap
  return { world, boss }
}

/** 把 Boss 打到剩一點血的那條命條，再補一拳讓它掉一條。 */
function breakBar(boss: Boss) {
  const barSize = boss.def.barSize
  const intoBar = boss.life.hp - (boss.life.barsRemaining - 1) * barSize
  boss.life.damage(intoBar - 1)
  boss.receiveHit(JAB, 1)
}

describe('bosses', () => {
  it('spawning a boss shows the warning banner and its life bars', () => {
    const { world, boss } = arena('kane')
    expect(world.bossBanner?.boss).toBe(boss)
    expect(boss.life.barsRemaining).toBe(BOSSES.kane.bars)
  })

  it('a boss attacks an idle agent', () => {
    const { world } = arena('kane')
    run(world, 600)
    expect(world.agent.life.hp).toBeLessThan(world.agent.life.max)
  })

  it('losing a bar knocks the boss down; it gets up in the next phase, invulnerable in between', () => {
    const { world, boss } = arena('kane', 200)
    breakBar(boss)
    expect(boss.life.barsRemaining).toBe(1)
    expect(boss.phaseNumber).toBe(1)
    run(world, 30)
    expect(boss.hurtbox()).toBeNull()
    run(world, 200)
    expect(boss.phaseNumber).toBe(2)
    expect(boss.hurtbox()).not.toBeNull()
  })

  it('poise: after four quick hits the boss shrugs off the next one and counter-attacks', () => {
    const { world, boss } = arena('kane', 20)
    for (let i = 0; i < 4; i++) {
      boss.receiveHit(JAB, 1)
      run(world, 3)
    }
    let attacked = false
    for (let i = 0; i < 40 && !attacked; i++) {
      run(world, 1)
      if (boss.attacking) attacked = true
    }
    expect(attacked).toBe(true)
    boss.receiveHit(JAB, 1)
    expect(boss.attacking).toBe(true)
  })

  it('a boss keeps its weapon when knocked down', () => {
    const { world, boss } = arena('kane', 200)
    boss.receiveHit({ ...JAB, knockdown: true }, 1)
    run(world, 120)
    expect(boss.held?.type).toBe('crowbar')
    expect(world.items).toHaveLength(0)
  })

  it('Ryu holds a katana in each hand', () => {
    const { boss } = arena('ryu')
    expect(boss.held?.type).toBe('katana')
    expect(boss.heldBack?.type).toBe('katana')
  })

  it('Johnson draws a pistol and calls in henchmen in phase 2', () => {
    const { world, boss } = arena('johnson', 200)
    expect(boss.held).toBeNull()
    breakBar(boss)
    run(world, 200)
    expect(boss.phaseNumber).toBe(2)
    expect(boss.held?.type).toBe('pistol')
    expect(world.enemies.filter((e) => e instanceof Grunt).length).toBe(2)
  })

  it('Johnson’s spray fires high shots then low shots', () => {
    const { world, boss } = arena('johnson', 200)
    breakBar(boss)
    run(world, 200)
    world.enemies = world.enemies.filter((e) => e === boss)
    const heights = new Set<number>()
    for (let i = 0; i < 900; i++) {
      tick(world, [], ['down'])
      for (const b of world.bullets) heights.add(Math.round(b.h))
    }
    expect([...heights].some((h) => h >= 26)).toBe(true)
    expect([...heights].some((h) => h <= 10)).toBe(true)
  })

  it('Johnson throws desks in phase 3', () => {
    const { world, boss } = arena('johnson', 150)
    breakBar(boss)
    run(world, 200)
    breakBar(boss)
    run(world, 200)
    expect(boss.phaseNumber).toBe(3)
    world.enemies = world.enemies.filter((e) => e === boss)
    let sawDesk = false
    for (let i = 0; i < 4000 && !sawDesk; i++) {
      world.agent.life.hp = world.agent.life.max // 別讓特務被打死，魔王才會持續出招
      tick(world)
      if (world.items.some((it) => it.item.type === 'desk' && it.state === 'flying')) sawDesk = true
    }
    expect(sawDesk).toBe(true)
  })
})

describe('boss floors', () => {
  it('each floor ends with its boss: Kane on 1F, Ryu on 2F, Johnson on 3F', () => {
    const lastWave = (i: number) => FLOORS[i].zones.at(-1)!.waves.at(-1)!
    expect(lastWave(0).some((s) => 'boss' in s && s.boss === 'kane')).toBe(true)
    expect(lastWave(1).some((s) => 'boss' in s && s.boss === 'ryu')).toBe(true)
    expect(lastWave(2).some((s) => 'boss' in s && s.boss === 'johnson')).toBe(true)
  })

  it('defeating Johnson takes his henchmen down with him and completes the mission', () => {
    const world = new World({ startFloor: 2 })
    const floor = world.floor!
    for (const zone of floor.zones.slice(0, -1)) {
      world.agent.x = zone.start + VIEW_W / 2
      for (let i = 0; i < 2000 && (world.director!.locked || world.director!.zone !== zone); i++) {
        tick(world)
        world.enemies = []
      }
    }
    world.agent.x = floor.zones.at(-1)!.start + VIEW_W / 2
    tick(world)
    const johnson = world.boss!
    expect(johnson.label).toBe('JOHNSON')
    world.spawn({ type: 'thug', side: 'left' })
    const henchman = world.enemies.find((e) => e instanceof Grunt)!

    johnson.life.damage(johnson.life.hp - 1)
    johnson.receiveHit(JAB, 1)
    run(world, 10)
    expect(henchman.life.isDead).toBe(true)

    for (let i = 0; i < 600 && world.phase !== 'complete'; i++) tick(world)
    expect(world.phase).toBe('complete')
  })
})
