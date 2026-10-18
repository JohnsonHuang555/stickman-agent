import { describe, expect, it, vi } from 'vitest'
import { App, type AppDeps } from './app'
import type { Button } from './game/input/buttons'
import { SETTINGS_MENU, TITLE_MENU } from './game/render/screens'
import { CLEARED_FLOOR, LocalLeaderboard } from './leaderboard/leaderboard'

function memoryStore() {
  const data = new Map<string, string>()
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) }
}

function makeApp(overrides: Partial<AppDeps> = {}) {
  const leaderboard = new LocalLeaderboard(memoryStore())
  const deps: AppDeps = {
    worldOptions: { mode: 'campaign' },
    leaderboard,
    askNickname: vi.fn(async () => null),
    loadNickname: () => null,
    saveNickname: vi.fn(),
    sound: vi.fn(),
    now: () => 1000,
    ...overrides,
  }
  return { app: new App(deps), deps, leaderboard }
}

const press = (app: App, ...pressed: Button[]) => app.update({ pressed, held: new Set(pressed) })
const idle = (app: App, frames = 1) => {
  for (let i = 0; i < frames; i++) app.update({ pressed: [], held: new Set() })
}
/** 等待非同步的對話框與排行榜讀寫完成。 */
const settle = () => new Promise((r) => setTimeout(r, 0))

/** 從標題開始遊戲，直接讓特務陣亡並按 Z 確認。 */
function loseRun(app: App) {
  press(app, 'confirm')
  if (app.screen.kind !== 'playing') throw new Error('not playing')
  const world = app.screen.world
  world.agent.life.damage(999)
  world.gameOver = true
  idle(app, 61)
  press(app, 'punch')
}

describe('App flow', () => {
  it('starts on the title menu; the cursor wraps', () => {
    const { app } = makeApp()
    expect(app.screen).toEqual({ kind: 'title', cursor: 0 })
    press(app, 'up')
    expect(app.screen).toEqual({ kind: 'title', cursor: TITLE_MENU.length - 1 })
    press(app, 'down')
    expect(app.screen).toEqual({ kind: 'title', cursor: 0 })
  })

  it('START begins a campaign on 1F with sound wired up', () => {
    const { app, deps } = makeApp()
    press(app, 'confirm')
    expect(app.screen.kind).toBe('playing')
    if (app.screen.kind === 'playing') {
      expect(app.screen.world.floor?.label).toBe('1F')
      app.screen.world.sound('hit')
      expect(deps.sound).toHaveBeenCalledWith('hit')
    }
  })

  it('first game over asks for a nickname; skipping submits ANONYMOUS and shows the leaderboard', async () => {
    const { app, deps, leaderboard } = makeApp()
    loseRun(app)
    expect(app.screen.kind).toBe('dialog')
    expect(deps.askNickname).toHaveBeenCalledWith({ initial: null, firstTime: true })
    await settle()
    expect(app.screen.kind).toBe('leaderboard')
    const [entry] = await leaderboard.top(10)
    expect(entry).toMatchObject({ nickname: 'ANONYMOUS', floor: 1 })
    expect(deps.saveNickname).not.toHaveBeenCalled()
  })

  it('entering a nickname saves it and uses it', async () => {
    const { app, deps, leaderboard } = makeApp({ askNickname: vi.fn(async () => 'AGENT47') })
    loseRun(app)
    await settle()
    expect(deps.saveNickname).toHaveBeenCalledWith('AGENT47')
    expect((await leaderboard.top(1))[0].nickname).toBe('AGENT47')
    expect(app.nickname).toBe('AGENT47')
  })

  it('a stored nickname skips the dialog', async () => {
    const { app, deps, leaderboard } = makeApp({ loadNickname: () => 'KEPT' })
    loseRun(app)
    expect(deps.askNickname).not.toHaveBeenCalled()
    await settle()
    expect((await leaderboard.top(1))[0].nickname).toBe('KEPT')
  })

  it('the leaderboard highlights the run just finished and returns to the title', async () => {
    const { app } = makeApp({ loadNickname: () => 'ME' })
    loseRun(app)
    await settle()
    if (app.screen.kind !== 'leaderboard') throw new Error('expected leaderboard')
    expect(app.screen.highlight).toMatchObject({ nickname: 'ME' })
    expect(app.screen.entries).toHaveLength(1)
    press(app, 'confirm')
    expect(app.screen.kind).toBe('title')
  })

  it('a cleared run is recorded as CLEARED_FLOOR', async () => {
    const { app, leaderboard } = makeApp({ loadNickname: () => 'ME' })
    press(app, 'confirm')
    if (app.screen.kind !== 'playing') throw new Error('not playing')
    const world = app.screen.world
    world.phase = 'complete'
    world.phaseFrame = 0
    idle(app, 61)
    press(app, 'punch')
    await settle()
    expect((await leaderboard.top(1))[0].floor).toBe(CLEARED_FLOOR)
  })

  it('NICKNAME lives in SETTINGS: it opens the dialog with the current name and returns to settings', async () => {
    const ask = vi.fn(async () => 'NEW')
    const { app, deps } = makeApp({ loadNickname: () => 'OLD', askNickname: ask })
    expect(TITLE_MENU).not.toContain('NICKNAME')
    for (let i = 0; i < TITLE_MENU.indexOf('SETTINGS'); i++) press(app, 'down')
    press(app, 'confirm')
    for (let i = 0; i < SETTINGS_MENU.indexOf('NICKNAME'); i++) press(app, 'down')
    press(app, 'confirm')
    expect(ask).toHaveBeenCalledWith({ initial: 'OLD', firstTime: false })
    await settle()
    expect(app.nickname).toBe('NEW')
    expect(deps.saveNickname).toHaveBeenCalledWith('NEW')
    expect(app.screen).toEqual({ kind: 'settings', cursor: SETTINGS_MENU.indexOf('NICKNAME') })
  })

  it('LEADERBOARD on the title shows the board without a highlight', async () => {
    const { app } = makeApp()
    for (let i = 0; i < TITLE_MENU.indexOf('LEADERBOARD'); i++) press(app, 'down')
    press(app, 'confirm')
    await settle()
    expect(app.screen).toMatchObject({ kind: 'leaderboard', highlight: null, entries: [] })
  })
})
