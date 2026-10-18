import { musicFor, type MusicTrack } from './audio/music'
import type { Sound } from './audio/sfx'
import type { InputSnapshot } from './game/input/buttons'
import { PAUSE_MENU, SETTINGS_MENU, TITLE_MENU, drawLeaderboard, drawSettings, drawTitle, usingTouchHints, type SettingsItem } from './game/render/screens'
import { World, type WorldOptions } from './game/world'
import { ANONYMOUS, type Leaderboard, type LeaderboardEntry } from './leaderboard/leaderboard'
import { DEFAULT_SETTINGS, adjustVolume, type Settings } from './settings'
import { Tutorial } from './game/tutorial'

const LEADERBOARD_SIZE = 10

export interface AppDeps {
  worldOptions: WorldOptions
  leaderboard: Leaderboard
  /** 跳出暱稱對話框；回傳 null 表示略過或取消。 */
  askNickname: (options: { initial: string | null; firstTime: boolean }) => Promise<string | null>
  loadNickname: () => string | null
  saveNickname: (name: string) => void
  sound: (s: Sound) => void
  /** 每幀告訴背景音樂現在該放哪首、是否暫停。 */
  music?: (track: MusicTrack | null, paused: boolean) => void
  /** 一開始的設定（音量）；省略用預設值。 */
  settings?: Settings
  /** 設定改變時呼叫（套用音量、存起來）。 */
  onSettingsChange?: (settings: Settings) => void
  /** 對話框關閉後呼叫，清掉殘留按鍵。 */
  onDialogClosed?: () => void
  now?: () => number
}

/**
 * - title：標題選單
 * - playing：遊玩中
 * - dialog：等待暱稱對話框
 * - leaderboard：排行榜（遊玩結束後會標出自己這筆）
 * - settings：設定（音量與操作說明）；遊戲中暫停時同一個面板蓋在遊戲畫面上
 */
type Screen =
  | { kind: 'title'; cursor: number }
  | { kind: 'playing'; world: World; tutorial?: Tutorial }
  | { kind: 'dialog'; background: World | null }
  | { kind: 'leaderboard'; entries: LeaderboardEntry[] | null; highlight: LeaderboardEntry | null }
  | { kind: 'settings'; cursor: number }

/** 整個遊戲的畫面流程。 */
export class App {
  screen: Screen = { kind: 'title', cursor: 0 }
  nickname: string | null
  settings: Settings
  /** 遊戲中暫停時，設定面板的游標；quitArmed = 已經按過一次「回到主畫面」，再按一次才真的離開。 */
  pauseCursor = 0
  quitArmed = false
  private frame = 0

  constructor(private readonly deps: AppDeps) {
    this.nickname = deps.loadNickname()
    this.settings = deps.settings ?? { ...DEFAULT_SETTINGS }
  }

  update(input: InputSnapshot): void {
    this.frame++
    const pressed = (...buttons: string[]) => input.pressed.some((b) => buttons.includes(b))
    const screen = this.screen

    switch (screen.kind) {
      case 'title': {
        if (pressed('up')) this.moveCursor(screen, -1)
        if (pressed('down')) this.moveCursor(screen, 1)
        if (pressed('punch', 'confirm', 'jump')) this.choose(TITLE_MENU[screen.cursor])
        break
      }
      case 'playing': {
        const world = screen.world
        const wasPaused = world.paused
        world.update(input)
        if (world.paused) {
          // 剛按下暫停：游標回到第一項；之後在面板上調音量，選 RESUME 繼續
          if (!wasPaused) {
            this.pauseCursor = 0
            this.quitArmed = false
          } else {
            const before = this.pauseCursor
            this.pauseCursor = this.settingsInput(pressed, this.pauseCursor, PAUSE_MENU, (item) => {
              if (item === 'DONE') world.paused = false
              else if (this.quitArmed) this.quitToTitle()
              else this.quitArmed = true
            })
            // 移開游標就取消「回到主畫面」的確認
            if (this.pauseCursor !== before) this.quitArmed = false
          }
        }
        if (screen.tutorial) {
          screen.tutorial.update(world)
          // 練習模式不記成績：萬一倒下就重新開一個練習場，教學進度保留
          if (world.restartRequested) this.screen = { kind: 'playing', world: this.newWorld({ mode: 'training' }), tutorial: screen.tutorial }
        } else if (world.restartRequested) void this.finishRun(world)
        break
      }
      case 'settings': {
        const back = () => {
          this.screen = { kind: 'title', cursor: TITLE_MENU.indexOf('SETTINGS') }
        }
        if (pressed('pause')) {
          this.deps.sound('select')
          back()
          break
        }
        screen.cursor = this.settingsInput(pressed, screen.cursor, SETTINGS_MENU, back)
        break
      }
      case 'dialog':
        break
      case 'leaderboard':
        if (pressed('punch', 'confirm', 'pause', 'jump')) {
          this.deps.sound('select')
          this.screen = { kind: 'title', cursor: 0 }
        }
        break
    }
    this.updateMusic()
  }

  /** 現在該放的背景音樂：遊玩中依樓層與 Boss 決定，其他畫面安靜。 */
  get musicTrack(): MusicTrack | null {
    const screen = this.screen
    if (screen.kind !== 'playing') return musicFor({ playing: null })
    const world = screen.world
    const boss = world.boss
    return musicFor({
      playing: {
        finalFloor: !!world.floor?.final,
        bossAlive: !!boss && !boss.life.isDead,
        ended: world.gameOver || world.phase === 'complete',
      },
    })
  }

  private updateMusic(): void {
    // 暫停時音樂不停：在暫停面板調音樂音量時才聽得到變化
    this.deps.music?.(this.musicTrack, false)
  }

  /**
   * 設定面板的操作：↑↓ 選項、←→ 調音量、在 DONE／QUIT 按 Z／ENTER 執行 choose。回傳新的游標。
   */
  private settingsInput(
    pressed: (...buttons: string[]) => boolean,
    cursor: number,
    items: readonly SettingsItem[],
    choose: (item: 'DONE' | 'QUIT') => void,
  ): number {
    const n = items.length
    if (pressed('up')) {
      this.deps.sound('menu')
      return (cursor - 1 + n) % n
    }
    if (pressed('down')) {
      this.deps.sound('menu')
      return (cursor + 1) % n
    }
    const item = items[cursor]
    const delta = pressed('right') ? 1 : pressed('left') ? -1 : 0
    if (delta && (item === 'MUSIC' || item === 'SFX')) {
      this.settings = adjustVolume(this.settings, item === 'MUSIC' ? 'music' : 'sfx', delta)
      this.deps.onSettingsChange?.(this.settings)
      // 調音效時放一聲讓玩家聽聽看大小
      this.deps.sound(item === 'SFX' ? 'hit' : 'menu')
    }
    if ((item === 'DONE' || item === 'QUIT') && pressed('punch', 'confirm', 'jump')) {
      this.deps.sound('select')
      choose(item)
    }
    return cursor
  }

  /** 從暫停面板回到主畫面：放棄這一局，不記錄成績。 */
  private quitToTitle(): void {
    this.quitArmed = false
    this.screen = { kind: 'title', cursor: 0 }
  }

  private moveCursor(screen: { cursor: number }, delta: number): void {
    screen.cursor = (screen.cursor + delta + TITLE_MENU.length) % TITLE_MENU.length
    this.deps.sound('menu')
  }

  private choose(item: (typeof TITLE_MENU)[number]): void {
    this.deps.sound('select')
    if (item === 'START') {
      this.screen = { kind: 'playing', world: this.newWorld(this.deps.worldOptions) }
    } else if (item === 'PRACTICE') {
      this.screen = { kind: 'playing', world: this.newWorld({ mode: 'training' }), tutorial: new Tutorial() }
    } else if (item === 'LEADERBOARD') {
      void this.showLeaderboard(null)
    } else if (item === 'SETTINGS') {
      this.screen = { kind: 'settings', cursor: 0 }
    } else {
      void this.changeNickname()
    }
  }

  private newWorld(options: WorldOptions): World {
    const world = new World(options)
    world.sound = this.deps.sound
    world.pauseOverlay = false
    return world
  }

  private async changeNickname(): Promise<void> {
    this.screen = { kind: 'dialog', background: null }
    const name = await this.deps.askNickname({ initial: this.nickname, firstTime: false })
    if (name) this.setNickname(name)
    this.deps.onDialogClosed?.()
    this.screen = { kind: 'title', cursor: TITLE_MENU.indexOf('NICKNAME') }
  }

  /** 一局結束：還沒有暱稱就先問一次（可略過），然後上傳成績並顯示排行榜。 */
  private async finishRun(world: World): Promise<void> {
    const result = world.result
    let name = this.nickname
    if (!name) {
      this.screen = { kind: 'dialog', background: world }
      name = await this.deps.askNickname({ initial: null, firstTime: true })
      if (name) this.setNickname(name)
      this.deps.onDialogClosed?.()
    }
    const entry: LeaderboardEntry = {
      nickname: name ?? ANONYMOUS,
      floor: result.floor,
      score: result.score,
      at: (this.deps.now ?? Date.now)(),
    }
    this.screen = { kind: 'leaderboard', entries: null, highlight: entry }
    try {
      await this.deps.leaderboard.submit(entry)
    } catch {
      // 上傳失敗仍然顯示排行榜
    }
    await this.showLeaderboard(entry)
  }

  private async showLeaderboard(highlight: LeaderboardEntry | null): Promise<void> {
    this.screen = { kind: 'leaderboard', entries: null, highlight }
    let entries: LeaderboardEntry[] = []
    try {
      entries = await this.deps.leaderboard.top(LEADERBOARD_SIZE)
    } catch {
      entries = []
    }
    if (this.screen.kind === 'leaderboard') this.screen = { kind: 'leaderboard', entries, highlight }
  }

  private setNickname(name: string): void {
    this.nickname = name
    this.deps.saveNickname(name)
  }

  render(ctx: CanvasRenderingContext2D): void {
    const screen = this.screen
    switch (screen.kind) {
      case 'title':
        drawTitle(ctx, screen.cursor, this.nickname, this.frame)
        break
      case 'playing':
        screen.world.render(ctx)
        screen.tutorial?.draw(ctx, this.frame, usingTouchHints())
        if (screen.world.paused) drawSettings(ctx, this.settings, this.pauseCursor, this.frame, true, this.quitArmed)
        break
      case 'settings':
        drawSettings(ctx, this.settings, screen.cursor, this.frame, false)
        break
      case 'dialog':
        if (screen.background) screen.background.render(ctx)
        else drawTitle(ctx, TITLE_MENU.indexOf('NICKNAME'), this.nickname, this.frame)
        break
      case 'leaderboard':
        drawLeaderboard(ctx, screen.entries, screen.highlight, this.frame)
        break
    }
  }
}
