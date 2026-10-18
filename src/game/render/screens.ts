import { ANONYMOUS, floorLabel, type LeaderboardEntry } from '../../leaderboard/leaderboard'
import { CONTROL_GROUPS, type Settings } from '../../settings'
import { GROUND_Y, VIEW_H, VIEW_W } from '../constants'
import { Boss } from '../enemies/boss'
import { drawStickman } from '../stickman/pose'
import { ATTACK_POSES } from '../stickman/poses'
import { drawBackground } from './background'
import { text } from './hud'

export const TITLE_MENU = ['START', 'LEADERBOARD', 'SETTINGS', 'NICKNAME'] as const
/** 從標題進入的設定畫面：DONE 顯示為 BACK。 */
export const SETTINGS_MENU = ['MUSIC', 'SFX', 'DONE'] as const
/** 遊戲中暫停的面板：DONE 顯示為 RESUME，多一個回到主畫面。 */
export const PAUSE_MENU = ['MUSIC', 'SFX', 'DONE', 'QUIT'] as const
export type SettingsItem = (typeof PAUSE_MENU)[number]

// 標題畫面的魔王只是裝飾
const titleBoss = new Boss(400, 'johnson')
titleBoss.facing = -1

function dim(ctx: CanvasRenderingContext2D, alpha: number): void {
  ctx.fillStyle = `rgba(0,0,0,${alpha})`
  ctx.fillRect(0, 0, VIEW_W, VIEW_H)
}

export function drawTitle(ctx: CanvasRenderingContext2D, cursor: number, nickname: string | null, frame: number): void {
  drawBackground(ctx, 'office', frame * 0.3, null, frame)
  dim(ctx, 0.45)

  drawStickman(ctx, ATTACK_POSES.flyingKick[1], 90, GROUND_Y - 30, 1, { body: '#111111', back: '#4a4a4a' }, 1.6)
  titleBoss.draw(ctx, 0)

  text(ctx, 'STICKMAN', VIEW_W / 2, 34, 24, 'center')
  text(ctx, 'AGENT', VIEW_W / 2, 64, 24, 'center')

  TITLE_MENU.forEach((item, i) => {
    const y = 128 + i * 18
    const label = item === 'NICKNAME' ? `NAME: ${nickname ?? '---'}` : item
    text(ctx, label, VIEW_W / 2, y, 8, 'center')
    if (i === cursor && Math.floor(frame / 15) % 2 === 0) text(ctx, '▶', VIEW_W / 2 - 80, y, 8, 'left')
  })

  ctx.font = '7px monospace'
  ctx.textAlign = 'center'
  ctx.fillStyle = 'rgba(255,255,255,0.7)'
  ctx.fillText('W S 選擇   J / ENTER 確定', VIEW_W / 2, VIEW_H - 6)
}

export function drawLeaderboard(
  ctx: CanvasRenderingContext2D,
  entries: readonly LeaderboardEntry[] | null,
  highlight: LeaderboardEntry | null,
  frame: number,
): void {
  drawBackground(ctx, 'casino', frame * 0.3, null, frame)
  dim(ctx, 0.7)
  text(ctx, 'LEADERBOARD', VIEW_W / 2, 16, 16, 'center')

  if (!entries) {
    text(ctx, 'LOADING...', VIEW_W / 2, VIEW_H / 2, 8, 'center')
  } else if (entries.length === 0) {
    text(ctx, 'NO RECORDS YET', VIEW_W / 2, VIEW_H / 2, 8, 'center')
  } else {
    const cols = { rank: 70, name: 100, floor: 300, score: 410 }
    text(ctx, 'RANK', cols.rank, 46, 6)
    text(ctx, 'NAME', cols.name, 46, 6)
    text(ctx, 'FLOOR', cols.floor, 46, 6)
    text(ctx, 'SCORE', cols.score, 46, 6, 'right')
    entries.forEach((e, i) => {
      const y = 62 + i * 16
      const mine = highlight && e.at === highlight.at && e.nickname === highlight.nickname && e.score === highlight.score
      if (mine) {
        if (Math.floor(frame / 15) % 2 === 0) {
          ctx.fillStyle = 'rgba(245,197,24,0.35)'
          ctx.fillRect(cols.rank - 6, y - 3, cols.score - cols.rank + 12, 14)
        }
      }
      text(ctx, String(i + 1).padStart(2, ' '), cols.rank, y, 8)
      text(ctx, e.nickname || ANONYMOUS, cols.name, y, 8)
      text(ctx, floorLabel(e.floor), cols.floor, y, 8)
      text(ctx, String(e.score).padStart(6, '0'), cols.score, y, 8, 'right')
    })
  }

  ctx.font = '7px monospace'
  ctx.textAlign = 'center'
  ctx.fillStyle = 'rgba(255,255,255,0.7)'
  ctx.fillText('J / ENTER / ESC 返回', VIEW_W / 2, VIEW_H - 6)
}

/**
 * 設定畫面：上半部調音樂與音效音量，下半部是所有操作說明。
 * overlay = true 時畫在遊戲畫面上（遊戲中按 P／ESC 暫停）。
 */
export function drawSettings(
  ctx: CanvasRenderingContext2D,
  settings: Settings,
  cursor: number,
  frame: number,
  overlay: boolean,
  /** 已經按過一次 QUIT，等第二次確認。 */
  quitArmed = false,
): void {
  if (overlay) dim(ctx, 0.8)
  else {
    drawBackground(ctx, 'lobby', frame * 0.3, null, frame)
    dim(ctx, 0.75)
  }
  text(ctx, overlay ? 'PAUSE' : 'SETTINGS', VIEW_W / 2, 10, 12, 'center')

  const rows: [string, number | null][] = [
    ['MUSIC', settings.music],
    ['SFX', settings.sfx],
    [overlay ? 'RESUME' : 'BACK', null],
  ]
  if (overlay) rows.push([quitArmed ? 'QUIT TO TITLE?  PRESS J AGAIN' : 'QUIT TO TITLE', null])
  const rowGap = overlay ? 14 : 16
  rows.forEach(([label, value], i) => {
    const y = 32 + i * rowGap
    if (i === cursor && Math.floor(frame / 15) % 2 === 0) text(ctx, '▶', 128, y, 8)
    text(ctx, label, 144, y, 8)
    if (value === null) return
    // 音量條：20 格，每格 5%
    const cells = 20
    const filled = Math.round(value * cells)
    for (let c = 0; c < cells; c++) {
      ctx.fillStyle = c < filled ? '#f5c518' : 'rgba(255,255,255,0.2)'
      ctx.fillRect(208 + c * 5, y, 4, 8)
    }
    text(ctx, `${Math.round(value * 100)}%`, 318, y, 8)
  })

  // 操作說明：三欄
  const cols = [14, 170, 326]
  CONTROL_GROUPS.forEach((group, g) => {
    const x = cols[g]
    let y = overlay ? 98 : 92
    ctx.fillStyle = '#f5c518'
    ctx.font = 'bold 8px monospace'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText(group.title, x, y)
    y += 13
    ctx.font = '7px monospace'
    for (const [keys, action] of group.items) {
      ctx.fillStyle = '#ffffff'
      ctx.fillText(keys, x, y)
      ctx.fillStyle = 'rgba(255,255,255,0.75)'
      ctx.fillText(action, x + 62, y)
      y += overlay ? 12.5 : 13
    }
  })

  ctx.font = '7px monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = 'rgba(255,255,255,0.7)'
  ctx.fillText(overlay ? 'W S 選擇   A D 調整音量   J 確定   P／ESC 繼續遊戲' : 'W S 選擇   A D 調整音量   J 確定   ESC 返回', VIEW_W / 2, VIEW_H - 6)
}
