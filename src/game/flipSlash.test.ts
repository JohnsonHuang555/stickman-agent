import { describe, expect, it } from 'vitest'
import type { HitSpec } from './combat/types'
import { Boss } from './enemies/boss'
import { BOSSES } from './enemies/bosses'
import { BOSS_MOVES, FLIP, type BossMove } from './enemies/bossMoves'
import { World } from './world'

const tick = (world: World) => world.update({ pressed: [], held: new Set() })

const JAB: HitSpec = { from: 0, to: 0, box: { forward: 0, up: 0, w: 1, h: 1 }, damage: 6, hitstun: 16, knockback: 0.4 }
const KNOCKDOWN: HitSpec = { ...JAB, knockdown: true }

/** Ryu 站在特務右邊 gap 遠，立刻出空翻斬。 */
function flip(gap: number) {
  const world = new World({ mode: 'sandbox' })
  world.agent.x = 300
  world.spawn({ boss: 'ryu', side: 'right' })
  const boss = world.boss!
  boss.x = 300 + gap
  boss.facing = -1
  ;(boss as unknown as { startAttack(m: BossMove): void }).startAttack(BOSS_MOVES.flipSlash)
  return { world, boss }
}

/** 跑完整招，記錄過程。 */
function trace(world: World, boss: Boss) {
  let maxH = 0
  let maxTurn = 0
  let landX: number | null = null
  let rotationWhenHit: number | null = null
  const hp0 = world.agent.life.hp
  const agentX0 = world.agent.x
  for (let i = 0; i < FLIP.length + 5; i++) {
    const wasAir = boss.h > 0
    tick(world)
    maxH = Math.max(maxH, boss.h)
    maxTurn = Math.max(maxTurn, Math.abs(boss.rotation))
    if (wasAir && boss.h === 0 && landX === null) landX = boss.x - agentX0
    if (rotationWhenHit === null && world.agent.life.hp < hp0) rotationWhenHit = boss.rotation
  }
  return { maxH, maxTurn, landX, rotationWhenHit, damage: hp0 - world.agent.life.hp }
}

describe('Ryu flip slash', () => {
  it.each([60, 100, 140])('from %ipx away: leaps, flips a full turn, lands just in front of the agent and slashes for 18', (gap) => {
    const { world, boss } = flip(gap)
    const r = trace(world, boss)
    expect(r.maxH).toBeGreaterThan(30)
    expect(r.maxTurn).toBeGreaterThan(Math.PI * 1.8)
    expect(r.landX).not.toBeNull()
    // 落在特務前方，不會整個飛過頭
    expect(r.landX!).toBeGreaterThan(0)
    expect(r.landX!).toBeLessThan(40)
    expect(r.damage).toBe(18)
    // 斬下去時身體已經轉正
    expect(r.rotationWhenHit).toBe(0)
  })

  it('the wind-up is a readable tell: it stays on the ground for FLIP.windup frames', () => {
    const { world, boss } = flip(100)
    for (let i = 0; i < FLIP.windup - 1; i++) {
      tick(world)
      expect(boss.h).toBe(0)
    }
  })

  it('can be knocked out of the air, and then stops spinning', () => {
    const { world, boss } = flip(120)
    for (let i = 0; i < FLIP.windup + 6; i++) tick(world)
    expect(boss.rotation).not.toBe(0)
    boss.receiveHit(KNOCKDOWN, 1)
    tick(world)
    expect(boss.rotation).toBe(0)
    expect(boss.attacking).toBe(false)
  })

  it('leaves a punish window after landing: no armor, a jab interrupts it', () => {
    const { world, boss } = flip(100)
    world.agent.invuln = 999 // 不讓斬擊打中，專心看收招
    for (let i = 0; i < FLIP.slashTo + 1; i++) tick(world)
    expect(boss.h).toBe(0)
    expect(boss.attacking).toBe(true)
    boss.receiveHit(JAB, 1)
    expect(boss.attacking).toBe(false)
  })

  it('Ryu uses it in both phases, more often in phase 2', () => {
    const count = (i: number) => BOSSES.ryu.phases[i].moves.filter((m) => m === 'flipSlash').length
    expect(count(0)).toBeGreaterThanOrEqual(1)
    expect(count(1)).toBeGreaterThan(count(0))
  })
})
