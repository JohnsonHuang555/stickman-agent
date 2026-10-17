import { ANONYMOUS, floorLabel, type LeaderboardEntry } from '../../leaderboard/leaderboard'
import { GROUND_Y, VIEW_H, VIEW_W } from '../constants'
import { Boss } from '../enemies/boss'
import { drawStickman } from '../stickman/pose'
import { ATTACK_POSES } from '../stickman/poses'
import { drawBackground } from './background'
import { text } from './hud'

export const TITLE_MENU = ['START', 'LEADERBOARD', 'NICKNAME'] as const

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
  ctx.font = '12px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = '#f5c518'
  ctx.fillText('火柴人特務：黑幫大樓', VIEW_W / 2, 104)

  TITLE_MENU.forEach((item, i) => {
    const y = 128 + i * 18
    const label = item === 'NICKNAME' ? `NAME: ${nickname ?? '---'}` : item
    text(ctx, label, VIEW_W / 2, y, 8, 'center')
    if (i === cursor && Math.floor(frame / 15) % 2 === 0) text(ctx, '▶', VIEW_W / 2 - 80, y, 8, 'left')
  })

  ctx.font = '7px monospace'
  ctx.textAlign = 'center'
  ctx.fillStyle = 'rgba(255,255,255,0.7)'
  ctx.fillText('↑↓ 選擇   Z / ENTER 確定', VIEW_W / 2, VIEW_H - 6)
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
  ctx.fillText('Z / ENTER / ESC 返回', VIEW_W / 2, VIEW_H - 6)
}
