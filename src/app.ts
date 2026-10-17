import type { Sound } from './audio/sfx'
import type { InputSnapshot } from './game/input/buttons'
import { TITLE_MENU, drawLeaderboard, drawTitle } from './game/render/screens'
import { World, type WorldOptions } from './game/world'
import { ANONYMOUS, type Leaderboard, type LeaderboardEntry } from './leaderboard/leaderboard'

const LEADERBOARD_SIZE = 10

export interface AppDeps {
  worldOptions: WorldOptions
  leaderboard: Leaderboard
  /** 跳出暱稱對話框；回傳 null 表示略過或取消。 */
  askNickname: (options: { initial: string | null; firstTime: boolean }) => Promise<string | null>
  loadNickname: () => string | null
  saveNickname: (name: string) => void
  sound: (s: Sound) => void
  /** 對話框關閉後呼叫，清掉殘留按鍵。 */
  onDialogClosed?: () => void
  now?: () => number
}

/**
 * - title：標題選單
 * - playing：遊玩中
 * - dialog：等待暱稱對話框
 * - leaderboard：排行榜（遊玩結束後會標出自己這筆）
 */
type Screen =
  | { kind: 'title'; cursor: number }
  | { kind: 'playing'; world: World }
  | { kind: 'dialog'; background: World | null }
  | { kind: 'leaderboard'; entries: LeaderboardEntry[] | null; highlight: LeaderboardEntry | null }

/** 整個遊戲的畫面流程。 */
export class App {
  screen: Screen = { kind: 'title', cursor: 0 }
  nickname: string | null
  private frame = 0

  constructor(private readonly deps: AppDeps) {
    this.nickname = deps.loadNickname()
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
      case 'playing':
        screen.world.update(input)
        if (screen.world.restartRequested) void this.finishRun(screen.world)
        break
      case 'dialog':
        break
      case 'leaderboard':
        if (pressed('punch', 'confirm', 'pause', 'jump')) {
          this.deps.sound('select')
          this.screen = { kind: 'title', cursor: 0 }
        }
        break
    }
  }

  private moveCursor(screen: { cursor: number }, delta: number): void {
    screen.cursor = (screen.cursor + delta + TITLE_MENU.length) % TITLE_MENU.length
    this.deps.sound('menu')
  }

  private choose(item: (typeof TITLE_MENU)[number]): void {
    this.deps.sound('select')
    if (item === 'START') {
      const world = new World(this.deps.worldOptions)
      world.sound = this.deps.sound
      this.screen = { kind: 'playing', world }
    } else if (item === 'LEADERBOARD') {
      void this.showLeaderboard(null)
    } else {
      void this.changeNickname()
    }
  }

  private async changeNickname(): Promise<void> {
    this.screen = { kind: 'dialog', background: null }
    const name = await this.deps.askNickname({ initial: this.nickname, firstTime: false })
    if (name) this.setNickname(name)
    this.deps.onDialogClosed?.()
    this.screen = { kind: 'title', cursor: 2 }
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
        break
      case 'dialog':
        if (screen.background) screen.background.render(ctx)
        else drawTitle(ctx, 2, this.nickname, this.frame)
        break
      case 'leaderboard':
        drawLeaderboard(ctx, screen.entries, screen.highlight, this.frame)
        break
    }
  }
}
