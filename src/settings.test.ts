import { describe, expect, it, vi } from 'vitest'
import { App, type AppDeps } from './app'
import type { Button } from './game/input/buttons'
import { SETTINGS_MENU, TITLE_MENU } from './game/render/screens'
import { LocalLeaderboard } from './leaderboard/leaderboard'
import { CONTROL_GROUPS, DEFAULT_SETTINGS, adjustVolume, loadSettings, saveSettings, type Settings } from './settings'

function memoryStore() {
  const data = new Map<string, string>()
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) }
}

describe('settings storage', () => {
  it('defaults to music 30% and sfx 35%', () => {
    expect(DEFAULT_SETTINGS).toEqual({ music: 0.3, sfx: 0.35 })
    expect(loadSettings(memoryStore())).toEqual(DEFAULT_SETTINGS)
  })

  it('saves and loads, and ignores broken data', () => {
    const store = memoryStore()
    saveSettings({ music: 0.6, sfx: 0.1 }, store)
    expect(loadSettings(store)).toEqual({ music: 0.6, sfx: 0.1 })
    store.setItem('stickman.settings', '{not json')
    expect(loadSettings(store)).toEqual(DEFAULT_SETTINGS)
  })

  it('volume moves in 5% steps and stays within 0–100%', () => {
    let s: Settings = { music: 0.3, sfx: 0.35 }
    s = adjustVolume(s, 'music', 1)
    expect(s.music).toBeCloseTo(0.35)
    for (let i = 0; i < 30; i++) s = adjustVolume(s, 'music', 1)
    expect(s.music).toBe(1)
    for (let i = 0; i < 30; i++) s = adjustVolume(s, 'sfx', -1)
    expect(s.sfx).toBe(0)
  })

  it('the controls list covers the moves that used to be in the footer, plus the newer ones', () => {
    const all = CONTROL_GROUPS.flatMap((g) => g.items.map(([keys, action]) => `${keys} ${action}`)).join('\n')
    for (const word of ['移動', '拳', '踢', '跳', '撿', '背包', '挑空', '下砸', '飛踢', '閃身步', '保命招', '衝刺拳', '暫停', '跑步', '踢下體', '大風車', '過肩摔', '掙脫']) {
      expect(all).toContain(word)
    }
  })
})

describe('settings screen', () => {
  function makeApp() {
    const changes: Settings[] = []
    const deps: AppDeps = {
      worldOptions: { mode: 'campaign' },
      leaderboard: new LocalLeaderboard(memoryStore()),
      askNickname: vi.fn(async () => null),
      loadNickname: () => null,
      saveNickname: vi.fn(),
      sound: vi.fn(),
      onSettingsChange: (s) => changes.push(s),
    }
    return { app: new App(deps), changes }
  }
  const press = (app: App, ...pressed: Button[]) => app.update({ pressed, held: new Set(pressed) })

  /** 標題選單移到 SETTINGS 並進入。 */
  function openSettings(app: App) {
    for (let i = 0; i < TITLE_MENU.indexOf('SETTINGS'); i++) press(app, 'down')
    press(app, 'confirm')
  }

  it('SETTINGS on the title opens the settings screen; ←→ adjusts music, ↓ then ←→ adjusts sfx', () => {
    const { app, changes } = makeApp()
    openSettings(app)
    expect(app.screen).toEqual({ kind: 'settings', cursor: 0 })
    press(app, 'right')
    expect(app.settings.music).toBeCloseTo(0.35)
    press(app, 'down')
    press(app, 'left')
    press(app, 'left')
    expect(app.settings.sfx).toBeCloseTo(0.25)
    expect(changes).toHaveLength(3)
  })

  it('BACK or ESC returns to the title with the cursor on SETTINGS', () => {
    const { app } = makeApp()
    openSettings(app)
    press(app, 'pause')
    expect(app.screen).toEqual({ kind: 'title', cursor: TITLE_MENU.indexOf('SETTINGS') })
    press(app, 'confirm')
    press(app, 'up') // 游標從第一項往上繞到最後一項 BACK
    expect(app.screen).toEqual({ kind: 'settings', cursor: SETTINGS_MENU.length - 1 })
    press(app, 'confirm')
    expect(app.screen.kind).toBe('title')
  })

  it('pausing in a run opens the same panel: volume can be changed, RESUME continues the run', () => {
    const { app } = makeApp()
    press(app, 'confirm')
    if (app.screen.kind !== 'playing') throw new Error('not playing')
    const world = app.screen.world
    press(app, 'pause')
    expect(world.paused).toBe(true)
    press(app, 'right')
    expect(app.settings.music).toBeCloseTo(0.35)
    press(app, 'down')
    press(app, 'down') // MUSIC → SFX → RESUME
    press(app, 'confirm')
    expect(world.paused).toBe(false)
  })

  /** 開始一局並暫停，游標移到 QUIT TO TITLE。 */
  function pausedOnQuit() {
    const { app } = makeApp()
    press(app, 'confirm')
    press(app, 'pause')
    press(app, 'up') // 從第一項往上繞到最後一項 QUIT TO TITLE
    return app
  }

  it('QUIT TO TITLE asks once, and the second press returns to the title without recording a score', async () => {
    const app = pausedOnQuit()
    press(app, 'confirm')
    expect(app.screen.kind).toBe('playing')
    expect(app.quitArmed).toBe(true)
    press(app, 'confirm')
    expect(app.screen).toEqual({ kind: 'title', cursor: 0 })
    for (let i = 0; i < TITLE_MENU.indexOf('LEADERBOARD'); i++) press(app, 'down')
    press(app, 'confirm') // LEADERBOARD
    await new Promise((r) => setTimeout(r, 0))
    expect(app.screen).toMatchObject({ kind: 'leaderboard', entries: [] })
  })

  it('moving the cursor away cancels the quit confirmation', () => {
    const app = pausedOnQuit()
    press(app, 'confirm')
    press(app, 'up')
    press(app, 'down')
    expect(app.quitArmed).toBe(false)
    press(app, 'confirm')
    expect(app.screen.kind).toBe('playing') // 要重新確認一次，不會直接離開
  })

  it('the title-screen settings has no quit option (BACK already goes to the title)', () => {
    expect(SETTINGS_MENU).not.toContain('QUIT')
  })
})
