import { describe, expect, it, vi } from 'vitest'
import { App, type AppDeps } from '../app'
import type { Button } from '../game/input/buttons'
import { LocalLeaderboard } from '../leaderboard/leaderboard'
import { MUSIC_FILES, musicFor, type MusicTrack } from './music'

describe('musicFor', () => {
  const playing = (finalFloor: boolean, bossAlive: boolean, ended = false) => ({ playing: { finalFloor, bossAlive, ended } })

  it('1F and 2F share the main track, and switch to the mini-boss track while a boss is alive', () => {
    expect(musicFor(playing(false, false))).toBe('floorMain')
    expect(musicFor(playing(false, true))).toBe('floorBoss')
  })

  it('3F has its own main and boss tracks', () => {
    expect(musicFor(playing(true, false))).toBe('finalMain')
    expect(musicFor(playing(true, true))).toBe('finalBoss')
  })

  it('no music outside play, or once the run has ended', () => {
    expect(musicFor({ playing: null })).toBeNull()
    expect(musicFor(playing(false, true, true))).toBeNull()
  })

  it('every track points at a file that exists in public/music', () => {
    const files = Object.keys(import.meta.glob('../../public/music/*.mp3')).map((p) => p.split('/').pop())
    for (const file of Object.values(MUSIC_FILES)) expect(files).toContain(`${file}.mp3`)
  })
})

describe('music through a real run', () => {
  function makeApp(startFloor = 0) {
    const store = new Map<string, string>()
    const tracks: (MusicTrack | null)[] = []
    const deps: AppDeps = {
      worldOptions: { mode: 'campaign', startFloor },
      leaderboard: new LocalLeaderboard({ getItem: (k) => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v) }),
      askNickname: vi.fn(async () => null),
      loadNickname: () => null,
      saveNickname: vi.fn(),
      sound: vi.fn(),
      music: (track) => tracks.push(track),
    }
    return { app: new App(deps), tracks }
  }
  const press = (app: App, ...pressed: Button[]) => app.update({ pressed, held: new Set(pressed) })
  const world = (app: App) => {
    if (app.screen.kind !== 'playing') throw new Error('not playing')
    return app.screen.world
  }

  it('title is silent → 1F main → boss music when Kane appears → back to main once he is down', () => {
    const { app, tracks } = makeApp()
    press(app)
    expect(tracks.at(-1)).toBeNull()
    press(app, 'confirm')
    expect(tracks.at(-1)).toBe('floorMain')
    const w = world(app)
    w.spawn({ boss: 'kane', side: 'right' })
    press(app)
    expect(tracks.at(-1)).toBe('floorBoss')
    w.boss!.life.damage(99999)
    press(app)
    expect(tracks.at(-1)).toBe('floorMain')
  })

  it('3F plays its own main track, and the final boss track when Johnson appears', () => {
    const { app, tracks } = makeApp(2)
    press(app, 'confirm')
    const w = world(app)
    press(app)
    expect(tracks.at(-1)).toBe('finalMain')
    w.spawn({ boss: 'johnson', side: 'right' })
    press(app)
    expect(tracks.at(-1)).toBe('finalBoss')
  })

  it('game over stops the music', () => {
    const { app, tracks } = makeApp()
    press(app, 'confirm')
    world(app).gameOver = true
    press(app)
    expect(tracks.at(-1)).toBeNull()
  })
})
