import { describe, expect, it } from 'vitest'
import { MOVES } from './agent/moves'
import { ENEMY_MOVES } from './enemies/enemyMoves'
import { Grunt } from './enemies/grunt'
import type { Button } from './input/buttons'
import { World } from './world'

function tick(world: World, pressed: Button[] = [], held: Button[] = []) {
  world.update({ pressed, held: new Set([...held, ...pressed]) })
}

/** 雜兵出刺拳，特務在刺拳打到前 lead 幀按閃身步（held 決定往哪閃）。 */
function dodgeJab(lead: number, held: Button[] = []) {
  const world = new World({ mode: 'sandbox' })
  world.items = []
  world.agent.x = 300
  world.agent.life.hp = 9999
  const g = new Grunt(318, 'thug', { moves: ['jab'], passive: true })
  g.life.hp = 999
  g.facing = -1
  world.enemies = [g]
  for (let i = 0; i < 5; i++) tick(world)
  const hitAt = ENEMY_MOVES.jab.hit.from
  for (let f = 0; f <= 30; f++) {
    if (f === 30 - hitAt) (g as unknown as { startAttack(d: unknown): void }).startAttack(ENEMY_MOVES.jab)
    tick(world, f === 30 - lead ? ['dodge'] : [], f === 30 - lead ? held : [])
  }
  return { world, g }
}

describe('perfect dodge → counter (閃身步閃過攻擊就能反擊)', () => {
  it.each([
    ['back', 2, []],
    ['back', 10, []],
    ['forward', 4, ['right']],
  ] as [string, number, Button[]][])('dodging %s %i frames before the jab: no damage, slow motion, COUNTER window opens', (_d, lead, held) => {
    const { world } = dodgeJab(lead, held)
    expect(world.agent.life.hp).toBe(9999)
    expect(world.slowmo).toBeGreaterThan(0)
    expect(world.agent.counterReady(world.realFrame)).toBe(true)
  })

  it('pressing J in the window dashes in and counters for 20 with a knockdown; slow motion ends on the hit', () => {
    const { world, g } = dodgeJab(4)
    tick(world, ['punch'])
    let hit = false
    for (let i = 0; i < 60 && !hit; i++) {
      tick(world)
      hit = 999 - g.life.hp === MOVES.counter.hit.damage
    }
    expect(hit).toBe(true)
    expect(world.slowmo).toBe(0)
    expect(world.agent.counterReady(world.realFrame)).toBe(false)
  })

  it('K also counters', () => {
    const { world, g } = dodgeJab(4)
    tick(world, ['kick'])
    for (let i = 0; i < 60; i++) tick(world)
    expect(999 - g.life.hp).toBe(MOVES.counter.hit.damage)
  })

  it('doing nothing: the window closes and time goes back to normal', () => {
    const { world } = dodgeJab(4)
    for (let i = 0; i < 80; i++) tick(world)
    expect(world.slowmo).toBe(0)
    expect(world.agent.counterReady(world.realFrame)).toBe(false)
  })

  it('dodging too early (the invulnerability is over when the jab lands) is just a dodge, no counter', () => {
    const { world } = dodgeJab(20)
    expect(world.agent.counterReady(world.realFrame)).toBe(false)
  })

  it('dodging when nothing is attacking does not slow time', () => {
    const world = new World({ mode: 'sandbox' })
    world.items = []
    world.enemies = [new Grunt(330, 'thug', { passive: true })]
    tick(world, ['dodge'])
    for (let i = 0; i < 30; i++) tick(world)
    expect(world.slowmo).toBe(0)
    expect(world.agent.counterReady(world.realFrame)).toBe(false)
  })
})
