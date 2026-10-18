import { describe, expect, it, vi } from 'vitest'
import { App, type AppDeps } from '../app'
import { Boss } from './enemies/boss'
import type { Button } from './input/buttons'
import { SURVIVAL, SurvivalDirector, survivalPool, survivalTheme, survivalWave } from './level/survival'
import { TITLE_MENU } from './render/screens'
import { LocalLeaderboard } from '../leaderboard/leaderboard'
import { World } from './world'
import { WORLD_VIEW_W } from './constants'

describe('survival waves', () => {
  it('starts gentle (two thugs) and grows: more enemies and more kinds later on', () => {
    expect(survivalWave(1)).toEqual([
      { type: 'thug', side: 'right' },
      { type: 'thug', side: 'left' },
    ])
    expect(survivalWave(9).length).toBeGreaterThan(survivalWave(1).length)
    expect(survivalPool(1)).toEqual(['thug'])
    expect(survivalPool(8)).toContain('heavy')
  })

  it('every 5th wave is a boss (Kane → Ryu → Johnson → Kane…) with a few escorts', () => {
    const boss = (w: number) => survivalWave(w).find((s) => 'boss' in s)
    expect(boss(5)).toMatchObject({ boss: 'kane' })
    expect(boss(10)).toMatchObject({ boss: 'ryu' })
    expect(boss(15)).toMatchObject({ boss: 'johnson' })
    expect(boss(20)).toMatchObject({ boss: 'kane' })
    expect(boss(4)).toBeUndefined()
  })

  it('the scenery changes every 5 waves', () => {
    expect(survivalTheme(1)).toBe('lobby')
    expect(survivalTheme(6)).toBe('casino')
    expect(survivalTheme(11)).toBe('office')
    expect(survivalTheme(16)).toBe('lobby')
  })

  it('the director waits a moment, sends a wave, keeps at most maxAlive on screen, and moves on once it is cleared', () => {
    const d = new SurvivalDirector()
    let frame = 0
    let alive = 0
    const step = () => {
      const r = d.update(frame++, alive)
      alive += r.spawns.length
      return r
    }
    for (let i = 0; i <= SURVIVAL.pause; i++) step() // 停頓 pause 幀後出第一波
    expect(d.wave).toBe(1)
    for (let i = 0; i < 200; i++) step()
    expect(alive).toBe(2)
    alive = 0 // 全部打倒
    const cleared = step()
    expect(cleared.waveCleared).toBe(true)
    for (let i = 0; i < SURVIVAL.pause + 5; i++) step()
    expect(d.wave).toBe(2)
    // 很多敵人時也不會一次超過 maxAlive
    const big = new SurvivalDirector()
    big.wave = 12
    let a = 0
    for (let f = 0; f < 2000; f++) a += big.update(f, a).spawns.length
    expect(a).toBeLessThanOrEqual(SURVIVAL.maxAlive)
  })
})

describe('survival mode in the world', () => {
  const tick = (world: World) => world.update({ pressed: [], held: new Set() })

  it('a one-screen arena: wave 1 comes in, clearing it gives a bonus and some health, then wave 2 starts', () => {
    const world = new World({ mode: 'survival' })
    expect(world.floorWidth).toBe(WORLD_VIEW_W)
    world.agent.life.damage(100)
    for (let i = 0; i < SURVIVAL.pause + 120; i++) tick(world)
    expect(world.survival!.wave).toBe(1)
    expect(world.enemies.length).toBe(2)
    const hp = world.agent.life.hp
    const score = world.score
    for (const e of world.enemies) e.defeat()
    for (let i = 0; i < 200; i++) tick(world)
    expect(world.score).toBe(score + SURVIVAL.bonus * 1)
    expect(world.agent.life.hp).toBeGreaterThan(hp)
    expect(world.survival!.wave).toBe(2)
    expect(world.result.floor).toBe(2)
  })

  it('enemies stay inside the arena', () => {
    const world = new World({ mode: 'survival' })
    for (let i = 0; i < 400; i++) tick(world)
    for (const e of world.enemies) {
      expect(e.x).toBeGreaterThanOrEqual(8)
      expect(e.x).toBeLessThanOrEqual(WORLD_VIEW_W - 8)
    }
  })

  it('wave 5 brings in Kane', () => {
    const world = new World({ mode: 'survival' })
    world.survival!.wave = 4
    for (let i = 0; i < SURVIVAL.pause + 5; i++) tick(world)
    expect(world.enemies.some((e) => e instanceof Boss && e.bossId === 'kane')).toBe(true)
  })
})

describe('survival from the title, with its own leaderboard', () => {
  function makeApp() {
    const store = () => {
      const data = new Map<string, string>()
      return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) }
    }
    const story = new LocalLeaderboard(store(), 'story')
    const survival = new LocalLeaderboard(store(), 'survival')
    const deps: AppDeps = {
      worldOptions: { mode: 'campaign' },
      leaderboard: story,
      survivalLeaderboard: survival,
      askNickname: vi.fn(async () => 'RUNNER'),
      loadNickname: () => null,
      saveNickname: vi.fn(),
      sound: vi.fn(),
      now: () => 1,
    }
    return { app: new App(deps), story, survival }
  }
  const press = (app: App, ...pressed: Button[]) => app.update({ pressed, held: new Set(pressed) })
  const settle = () => new Promise((r) => setTimeout(r, 0))

  it('SURVIVAL starts a survival run; game over records waves on the survival board only', async () => {
    const { app, story, survival } = makeApp()
    for (let i = 0; i < TITLE_MENU.indexOf('SURVIVAL'); i++) press(app, 'down')
    press(app, 'confirm')
    if (app.screen.kind !== 'playing') throw new Error('not playing')
    const world = app.screen.world
    expect(world.mode).toBe('survival')
    world.survival!.wave = 7
    world.gameOver = true
    for (let i = 0; i < 61; i++) press(app)
    press(app, 'punch')
    await settle()
    await settle()
    expect(app.screen).toMatchObject({ kind: 'leaderboard', board: 'survival' })
    expect(await survival.top(10)).toMatchObject([{ nickname: 'RUNNER', floor: 7 }])
    expect(await story.top(10)).toEqual([])
  })

  it('the leaderboard screen switches between STORY and SURVIVAL with left/right', async () => {
    const { app } = makeApp()
    for (let i = 0; i < TITLE_MENU.indexOf('LEADERBOARD'); i++) press(app, 'down')
    press(app, 'confirm')
    await settle()
    expect(app.screen).toMatchObject({ kind: 'leaderboard', board: 'story' })
    press(app, 'right')
    await settle()
    expect(app.screen).toMatchObject({ kind: 'leaderboard', board: 'survival' })
    press(app, 'left')
    await settle()
    expect(app.screen).toMatchObject({ kind: 'leaderboard', board: 'story' })
  })
})
