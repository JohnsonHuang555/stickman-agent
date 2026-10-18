import { VIEW_H, VIEW_W } from '../constants'
import { floorLabel } from '../../leaderboard/leaderboard'
import { drawItemFlying } from '../items/itemArt'
import { ITEM_TYPES } from '../items/itemTypes'
import type { LifePool } from '../life/lifePool'
import type { World } from '../world'

/** 命條顏色，索引 0 為最後一條。 */
export const BAR_COLORS = ['#e8322b', '#f5c518', '#3cc35a'] as const

const FONT = '"Press Start 2P", monospace'

export function drawLifeBar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, life: LifePool) {
  const remaining = life.barsRemaining
  ctx.fillStyle = '#000'
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2)
  ctx.fillStyle = remaining >= 2 ? BAR_COLORS[remaining - 2] ?? BAR_COLORS[0] : '#3a0d0d'
  ctx.fillRect(x, y, w, h)
  if (remaining >= 1) {
    ctx.fillStyle = BAR_COLORS[remaining - 1] ?? BAR_COLORS[BAR_COLORS.length - 1]
    ctx.fillRect(x, y, Math.round(w * life.currentBarFill), h)
  }
}

export function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, size = 8, align: CanvasTextAlign = 'left') {
  ctx.font = `${size}px ${FONT}`
  ctx.textAlign = align
  ctx.textBaseline = 'top'
  ctx.fillStyle = '#000'
  ctx.fillText(s, x + 1, y + 1)
  ctx.fillStyle = '#fff'
  ctx.fillText(s, x, y)
}

/** 走上樓梯後的過層結算：畫面變暗，獎勵分數逐行出現。 */
function drawClear(ctx: CanvasRenderingContext2D, world: World): void {
  const t = world.phaseFrame
  ctx.fillStyle = `rgba(0,0,0,${Math.min(0.85, t / 30)})`
  ctx.fillRect(0, 0, VIEW_W, VIEW_H)
  const cx = VIEW_W / 2
  text(ctx, `${world.floor!.label} CLEAR`, cx, 70, 16, 'center')
  if (t > 40) text(ctx, `LIFE BONUS  ${String(world.clearBonus.life).padStart(5, ' ')}`, cx, 115, 8, 'center')
  if (t > 70) text(ctx, `TIME BONUS  ${String(world.clearBonus.time).padStart(5, ' ')}`, cx, 135, 8, 'center')
  if (t > 100) text(ctx, `SCORE ${String(world.score).padStart(6, '0')}`, cx, 160, 8, 'center')
  if (t > 130) {
    text(ctx, 'LIFE +20%', cx, 182, 8, 'center')
    drawLifeBar(ctx, cx - 55, 196, 110, 6, world.agent.life)
  }
}

/** 街機式連擊計數：大數字＋HITS，每次加一時跳一下；達門檻顯示評語與分數倍率。 */
function drawCombo(ctx: CanvasRenderingContext2D, world: World): void {
  const combo = world.combo
  if (combo.count < 2) return
  const age = world.realFrame - combo.bumpedAt
  const pop = age < 8 ? 1 + (8 - age) * 0.04 : 1
  const x = VIEW_W - 14
  const y = 62

  ctx.save()
  ctx.translate(x, y)
  ctx.scale(pop, pop)
  ctx.font = '20px "Press Start 2P", monospace'
  ctx.textAlign = 'right'
  ctx.textBaseline = 'alphabetic'
  const n = String(combo.count)
  ctx.fillStyle = '#1a1420'
  ctx.fillText(n, 2, 2)
  ctx.fillStyle = combo.count >= 10 ? '#ff7a2f' : '#ffe36b'
  ctx.fillText(n, 0, 0)
  ctx.restore()

  text(ctx, 'HITS', x, y + 4, 8, 'right')
  const rating = combo.rating
  if (rating) text(ctx, rating, x, y + 16, 8, 'right')
  if (combo.multiplier > 1) text(ctx, `SCORE x${combo.multiplier}`, x, y + (rating ? 28 : 16), 6, 'right')
}

/** 背包格：命條右邊的小格子，畫出裡面的東西；放槍時顯示子彈數。 */
function drawBag(ctx: CanvasRenderingContext2D, world: World): void {
  const x = 162
  const y = 15
  const w = 24
  const h = 16
  text(ctx, 'BAG', x + w + 4, y + 2, 6)
  // 淺色底：槍這類深色的東西放進來才看得清楚
  ctx.fillStyle = '#ece6da'
  ctx.fillRect(x, y, w, h)
  ctx.strokeStyle = '#1a1420'
  ctx.lineWidth = 1.5
  ctx.strokeRect(x + 0.75, y + 0.75, w - 1.5, h - 1.5)
  const bag = world.agent.bag
  if (!bag) return
  ctx.save()
  ctx.translate(x + w / 2, y + h / 2)
  ctx.scale(1.5, 1.5)
  drawItemFlying(ctx, bag.type, 0, 0, 0)
  ctx.restore()
  if (ITEM_TYPES[bag.type].category === 'firearm') text(ctx, `x${bag.uses}`, x + w + 4, y + 11, 6)
}

export function drawHud(ctx: CanvasRenderingContext2D, world: World): void {
  // 淡色背景上白字不好讀：在上方資訊後面墊一條半透明深色底
  ctx.fillStyle = 'rgba(20,16,24,0.45)'
  ctx.fillRect(0, 0, VIEW_W, world.agent.held ? 40 : 32)

  text(ctx, `SCORE ${String(world.score).padStart(6, '0')}`, 8, 8)
  text(ctx, 'AGENT', 8, 20, 6)
  drawLifeBar(ctx, 44, 20, 110, 6, world.agent.life)
  const held = world.agent.held
  if (held) {
    const category = ITEM_TYPES[held.type].category
    const suffix = category === 'firearm' ? ` x${held.uses}` : category === 'melee' ? ` ${'|'.repeat(held.uses)}` : ''
    text(ctx, ITEM_TYPES[held.type].label + suffix, 44, 30, 6)
  }
  drawBag(ctx, world)

  const boss = world.boss
  if (boss && !boss.removed) {
    // Boss 命條固定在畫面下方，比雜兵的長
    const w = 220
    const x = (VIEW_W - w) / 2
    text(ctx, boss.label, x, VIEW_H - 34, 8)
    drawLifeBar(ctx, x, VIEW_H - 23, w, 7, boss.life)
  }

  drawCombo(ctx, world)

  const banner = world.bossBanner
  if (banner && banner.until > world.realFrame) {
    const t = banner.until - world.realFrame
    if (Math.floor(t / 12) % 2 === 0) {
      ctx.fillStyle = 'rgba(160,0,0,0.75)'
      ctx.fillRect(0, 70, VIEW_W, 16)
      text(ctx, 'WARNING', VIEW_W / 2, 74, 8, 'center')
    }
    text(ctx, banner.boss.label, VIEW_W / 2, 96, 16, 'center')
    text(ctx, banner.boss.def.title, VIEW_W / 2, 118, 8, 'center')
  }

  const focus = world.focus
  if (focus && focus.until > world.realFrame && !focus.target.removed && focus.target !== boss) {
    text(ctx, focus.target.label, VIEW_W - 8, 8, 6, 'right')
    drawLifeBar(ctx, VIEW_W - 118, 18, 110, 5, focus.target.life)
  }

  const survival = world.survival
  if (survival && survival.wave > 0) {
    text(ctx, `WAVE ${survival.wave}`, VIEW_W / 2, 8, 8, 'center')
    // 新的一波開始：WAVE n 標題（淡入淡出）
    const age = world.realFrame - survival.startedAt
    if (age < 90) {
      ctx.globalAlpha = Math.min(1, (90 - age) / 20)
      ctx.fillStyle = 'rgba(0,0,0,0.6)'
      ctx.fillRect(0, VIEW_H / 2 - 30, VIEW_W, 48)
      text(ctx, `WAVE ${survival.wave}`, VIEW_W / 2, VIEW_H / 2 - 22, 24, 'center')
      ctx.globalAlpha = 1
    }
  }

  const floor = world.floor
  if (floor) {
    text(ctx, floor.label, VIEW_W / 2, 8, 8, 'center')
    if (world.phase === 'play' && world.director?.showGo(world.agent.x) && Math.floor(world.realFrame / 20) % 2 === 0) {
      text(ctx, 'GO →', VIEW_W - 16, 100, 16, 'right')
    }
    if (world.phase === 'intro') {
      const alpha = Math.min(1, (110 - world.phaseFrame) / 20)
      ctx.globalAlpha = Math.max(0, alpha)
      ctx.fillStyle = 'rgba(0,0,0,0.6)'
      ctx.fillRect(0, VIEW_H / 2 - 34, VIEW_W, 56)
      text(ctx, floor.label, VIEW_W / 2, VIEW_H / 2 - 26, 24, 'center')
      text(ctx, floor.subtitle, VIEW_W / 2, VIEW_H / 2 + 4, 8, 'center')
      ctx.globalAlpha = 1
    }
    if (world.phase === 'clear') drawClear(ctx, world)
  }
  if (world.phase === 'complete') {
    ctx.fillStyle = 'rgba(0,0,0,0.7)'
    ctx.fillRect(0, 0, VIEW_W, VIEW_H)
    text(ctx, 'MISSION COMPLETE', VIEW_W / 2, VIEW_H / 2 - 30, 16, 'center')
    text(ctx, `SCORE ${String(world.score).padStart(6, '0')}`, VIEW_W / 2, VIEW_H / 2, 8, 'center')
    if (world.phaseFrame > 60 && Math.floor(world.realFrame / 30) % 2 === 0) {
      text(ctx, 'PRESS J', VIEW_W / 2, VIEW_H / 2 + 24, 8, 'center')
    }
  }


  if (world.gameOver) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)'
    ctx.fillRect(0, 0, VIEW_W, VIEW_H)
    text(ctx, 'GAME OVER', VIEW_W / 2, VIEW_H / 2 - 30, 16, 'center')
    const reached = world.survival ? `WAVE ${world.result.floor}` : floorLabel(world.result.floor)
    text(ctx, `REACHED ${reached}`, VIEW_W / 2, VIEW_H / 2 - 4, 8, 'center')
    text(ctx, `SCORE ${String(world.score).padStart(6, '0')}`, VIEW_W / 2, VIEW_H / 2 + 12, 8, 'center')
    if (world.phaseFrame > 60 && Math.floor(world.realFrame / 30) % 2 === 0) {
      text(ctx, 'PRESS J', VIEW_W / 2, VIEW_H / 2 + 34, 8, 'center')
    }
  }

  // 由外層（App）畫暫停設定面板時就不畫這個簡單的暫停畫面
  if (world.agent.counterReady(world.realFrame)) {
    // 四周暗角，中間留亮
    const g = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.35, VIEW_W / 2, VIEW_H / 2, VIEW_W * 0.6)
    g.addColorStop(0, 'rgba(10,20,40,0)')
    g.addColorStop(1, 'rgba(10,20,40,0.55)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, VIEW_W, VIEW_H)
    // 字從大縮到正常大小（不閃爍）
    const age = world.realFrame - world.counterAt
    const size = Math.round(16 + Math.max(0, 8 - age) * 1.5)
    text(ctx, 'COUNTER!', VIEW_W / 2, 66, size, 'center')
    text(ctx, 'J / K', VIEW_W / 2, 66 + size + 6, 8, 'center')
  }

  if (world.paused && world.pauseOverlay) {
    ctx.fillStyle = 'rgba(0,0,0,0.5)'
    ctx.fillRect(0, 0, VIEW_W, VIEW_H)
    text(ctx, 'PAUSE', VIEW_W / 2, VIEW_H / 2 - 8, 16, 'center')
  }
}
