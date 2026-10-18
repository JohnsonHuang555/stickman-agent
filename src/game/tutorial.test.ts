import { describe, expect, it } from 'vitest'
import { ENEMY_MOVES } from './enemies/enemyMoves'
import { Grunt } from './enemies/grunt'
import type { Button } from './input/buttons'
import { LESSONS, Tutorial } from './tutorial'
import { World } from './world'

/** 從第 title 課開始的練習：特務面前一個不會動、血很多的雜兵。 */
function lesson(title: string, gap = 18) {
  const world = new World({ mode: 'sandbox' })
  world.items = []
  world.agent.x = 300
  world.agent.life.hp = 9999
  const g = new Grunt(300 + gap, 'thug', { passive: true })
  g.life.hp = 999
  world.enemies = [g]
  const tutorial = new Tutorial()
  tutorial.index = LESSONS.findIndex((l) => l.title === title)
  expect(tutorial.index).toBeGreaterThanOrEqual(0)
  const start = tutorial.index
  const tick = (pressed: Button[] = [], held: Button[] = []) => {
    world.update({ pressed, held: new Set([...held, ...pressed]) })
    tutorial.update(world)
  }
  const run = (frames: number, held: Button[] = []) => {
    for (let i = 0; i < frames; i++) tick([], held)
  }
  /** 這一課完成了（打勾後過一會兒會換到下一課）。 */
  const passed = () => {
    run(80)
    return tutorial.index === start + 1
  }
  return { world, g, tutorial, tick, run, passed }
}

describe('practice mode lessons (each one completes when the move is actually performed)', () => {
  it('移動', () => {
    const l = lesson('移動')
    l.world.enemies = []
    l.run(40, ['right'])
    expect(l.passed()).toBe(true)
  })

  it('跑步', () => {
    const l = lesson('跑步')
    l.world.enemies = []
    l.tick(['right'])
    l.run(2, ['right'])
    l.run(4)
    l.tick(['right'])
    l.run(5, ['right'])
    expect(l.passed()).toBe(true)
  })

  it('跳', () => {
    const l = lesson('跳')
    l.tick(['up'])
    expect(l.passed()).toBe(true)
  })

  it('三段拳', () => {
    const l = lesson('三段拳', 14)
    for (let i = 0; i < 6; i++) {
      l.tick(['punch'])
      l.run(7)
    }
    expect(l.passed()).toBe(true)
  })

  it('踢', () => {
    const l = lesson('踢')
    l.tick(['kick'])
    expect(l.passed()).toBe(true)
  })

  it('挑空技 (S → W + J)', () => {
    const l = lesson('挑空技', 22)
    l.tick(['down'])
    l.tick(['up'])
    l.tick(['punch'])
    expect(l.passed()).toBe(true)
  })

  it('空中連段 (launch, jump, J J K)', () => {
    const l = lesson('空中連段', 22)
    l.tick(['down'])
    l.tick(['up'])
    l.tick(['punch'])
    l.run(7)
    l.tick(['jump'])
    l.run(8)
    l.tick(['punch'])
    l.run(7)
    l.tick(['punch'])
    l.run(7)
    l.tick(['kick'])
    expect(l.passed()).toBe(true)
  })

  it('閃身步', () => {
    const l = lesson('閃身步')
    l.tick(['dodge'])
    expect(l.passed()).toBe(true)
  })

  it('閃過反擊 (dodge just before a jab, then J)', () => {
    const l = lesson('閃過反擊')
    l.g.facing = -1
    const hitAt = ENEMY_MOVES.jab.hit.from
    for (let f = 0; f <= 30; f++) {
      if (f === 30 - hitAt) (l.g as unknown as { startAttack(d: unknown): void }).startAttack(ENEMY_MOVES.jab)
      l.tick(f === 26 ? ['dodge'] : [])
    }
    l.tick(['punch'])
    expect(l.passed()).toBe(true)
  })

  it('踢下體 (K K)', () => {
    const l = lesson('踢下體')
    l.tick(['kick'])
    l.run(3)
    l.tick(['kick'])
    expect(l.passed()).toBe(true)
  })

  it('抓人 (L in front of an enemy)', () => {
    const l = lesson('抓人', 16)
    l.tick(['grab'])
    expect(l.passed()).toBe(true)
  })

  it('抓住後的招式 (grab, then K throw)', () => {
    const l = lesson('抓住後的招式', 16)
    l.tick(['grab'])
    l.run(5)
    l.tick(['kick'])
    expect(l.passed()).toBe(true)
  })

  it('大風車 (grab, then forward → back → forward + K)', () => {
    const l = lesson('大風車', 16)
    l.tick(['grab'])
    l.run(5)
    l.tick(['right'])
    l.tick(['left'])
    l.tick(['right'])
    l.tick(['kick'])
    l.run(160) // 大風車整套約 72 幀，加上頭槌的頓幀與完成後的停留
    expect(l.tutorial.index).toBeGreaterThan(LESSONS.findIndex((x) => x.title === '大風車'))
  })

  it('撿武器 (L on a weapon)', () => {
    const l = lesson('撿武器')
    l.world.enemies = []
    l.world.placeItem('bat', l.world.agent.x)
    l.run(30)
    l.tick(['grab'])
    expect(l.passed()).toBe(true)
  })

  it('doing something else does not complete the lesson', () => {
    const l = lesson('挑空技', 22)
    l.tick(['punch'])
    expect(l.passed()).toBe(false)
  })

  it('the agent cannot die while practising (health refills when low)', () => {
    const l = lesson('移動')
    l.world.agent.life.hp = 5
    l.tick()
    expect(l.world.agent.life.hp).toBe(l.world.agent.life.max)
  })

  it('after the last lesson the tutorial is finished', () => {
    const l = lesson('撿武器')
    l.world.enemies = []
    l.world.placeItem('bat', l.world.agent.x)
    l.run(30)
    l.tick(['grab'])
    l.run(80)
    expect(l.tutorial.finished).toBe(true)
  })
})
