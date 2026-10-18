import { GROUND_Y, VIEW_H, VIEW_W } from '../constants'
import type { Theme } from '../level/floors'

/**
 * 扁平插畫風背景：大塊扁平色塊與柔和漸層、淡色低對比，不畫小細節，讓角色成為畫面焦點。
 * 每層樓用不同主色一眼區分：1F 白天的暖沙色大廳、2F 夜晚的翡翠綠賭場（金色柱子、綠絨地板）、
 * 3F 冷藍夜景的頂樓。顏色都避開角色色（特務黑、Ryu 深紅、Johnson 金），角色才看得清楚。
 */
const CEILING = 20

interface Palette {
  ceiling: string
  wallTop: string
  wallBottom: string
  /** 窗外天空（上→下）。 */
  sky: [string, string]
  /** 遠、近兩層城市剪影。 */
  cityFar: string
  cityNear: string
  frame: string
  pillar: string
  pillarShade: string
  floorTop: string
  floorBottom: string
  floorLine: string
}

const PALETTES: Record<Theme, Palette> = {
  lobby: {
    ceiling: '#d8bf94',
    wallTop: '#f5e6c8',
    wallBottom: '#ead4ac',
    sky: ['#9fcbea', '#e3f1f7'],
    cityFar: '#b7d2e6',
    cityNear: '#9dbcd6',
    frame: '#c8a978',
    pillar: '#ebd5ad',
    pillarShade: '#dcc095',
    floorTop: '#d9bf92',
    floorBottom: '#bf9f6e',
    floorLine: '#a3845a',
  },
  casino: {
    ceiling: '#3f6f5f',
    wallTop: '#cde6da',
    wallBottom: '#acd2c1',
    sky: ['#3b3a6e', '#7a6aa0'],
    cityFar: '#6a5f93',
    cityNear: '#564c7d',
    frame: '#c9a85a',
    pillar: '#e2c987',
    pillarShade: '#ccb06a',
    floorTop: '#4f8f74',
    floorBottom: '#356a55',
    floorLine: '#2a5644',
  },
  office: {
    ceiling: '#5c6c92',
    wallTop: '#dde3ef',
    wallBottom: '#c7d0e2',
    sky: ['#34457a', '#93a7d8'],
    cityFar: '#7c8fc0',
    cityNear: '#5f72a6',
    frame: '#6f7ea3',
    pillar: '#cfd7e6',
    pillarShade: '#bcc6da',
    floorTop: '#b4bfd4',
    floorBottom: '#919eb8',
    floorLine: '#76839e',
  },
}

/** 0..1 的固定雜湊，讓同一個位置每次畫出一樣的形狀。 */
const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return s - Math.floor(s)
}

/** 每隔 step 重複呼叫 draw(螢幕 x, 第幾個)；parallax 越小代表越遠。 */
function repeat(camX: number, step: number, parallax: number, draw: (x: number, index: number) => void): void {
  const offset = camX * parallax
  const first = Math.floor((offset - step) / step)
  const last = Math.ceil((offset + VIEW_W + step) / step)
  for (let i = first; i <= last; i++) draw(i * step - offset, i)
}

function vGradient(ctx: CanvasRenderingContext2D, y0: number, y1: number, top: string, bottom: string): CanvasGradient {
  const g = ctx.createLinearGradient(0, y0, 0, y1)
  g.addColorStop(0, top)
  g.addColorStop(1, bottom)
  return g
}

/** 一整排單色的大樓剪影（不畫窗戶）。 */
function city(ctx: CanvasRenderingContext2D, camX: number, parallax: number, baseY: number, maxH: number, color: string, seed: number): void {
  ctx.fillStyle = color
  repeat(camX, 26, parallax, (x, i) => {
    const h = maxH * (0.4 + hash(i + seed) * 0.6)
    ctx.fillRect(x, baseY - h, 27, h)
  })
}

/** 窗外景色：天空漸層＋兩層城市剪影（3F 另加月亮）。 */
function view(ctx: CanvasRenderingContext2D, p: Palette, theme: Theme, x: number, y: number, w: number, h: number, camX: number): void {
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.clip()
  ctx.fillStyle = vGradient(ctx, y, y + h, p.sky[0], p.sky[1])
  ctx.fillRect(x, y, w, h)
  if (theme === 'office') {
    // 月亮：淡淡的光暈＋圓
    const mx = 360 - camX * 0.04
    const my = y + h * 0.3
    const glow = ctx.createRadialGradient(mx, my, 0, mx, my, 40)
    glow.addColorStop(0, 'rgba(240,244,255,0.35)')
    glow.addColorStop(1, 'rgba(240,244,255,0)')
    ctx.fillStyle = glow
    ctx.fillRect(mx - 40, my - 40, 80, 80)
    ctx.fillStyle = 'rgba(244,246,255,0.95)'
    ctx.beginPath()
    ctx.arc(mx, my, 13, 0, Math.PI * 2)
    ctx.fill()
  }
  city(ctx, camX, 0.15, y + h, h * 0.6, p.cityFar, 7)
  city(ctx, camX, 0.3, y + h, h * 0.4, p.cityNear, 31)
  ctx.restore()
}

/** 柱子：一個平面色塊加一條陰影，沒有紋理。 */
function pillars(ctx: CanvasRenderingContext2D, p: Palette, camX: number, step: number): void {
  repeat(camX, step, 1, (x) => {
    ctx.fillStyle = p.pillar
    ctx.fillRect(x, CEILING, 24, GROUND_Y - CEILING)
    ctx.fillStyle = p.pillarShade
    ctx.fillRect(x + 17, CEILING, 7, GROUND_Y - CEILING)
  })
}

function floor(ctx: CanvasRenderingContext2D, p: Palette): void {
  ctx.fillStyle = vGradient(ctx, GROUND_Y, VIEW_H, p.floorTop, p.floorBottom)
  ctx.fillRect(0, GROUND_Y, VIEW_W, VIEW_H - GROUND_Y)
  ctx.fillStyle = p.floorLine
  ctx.fillRect(0, GROUND_Y, VIEW_W, 1.5)
  ctx.fillStyle = 'rgba(255,255,255,0.25)'
  ctx.fillRect(0, GROUND_Y + 1.5, VIEW_W, 3)
}

function wall(ctx: CanvasRenderingContext2D, p: Palette): void {
  ctx.fillStyle = vGradient(ctx, CEILING, GROUND_Y, p.wallTop, p.wallBottom)
  ctx.fillRect(0, 0, VIEW_W, GROUND_Y)
  ctx.fillStyle = p.ceiling
  ctx.fillRect(0, 0, VIEW_W, CEILING)
}

/** 1F：一排高窗與柱子。 */
function lobby(ctx: CanvasRenderingContext2D, p: Palette, camX: number): void {
  wall(ctx, p)
  repeat(camX, 240, 0.7, (x) => {
    view(ctx, p, 'lobby', x + 50, 44, 140, 120, camX)
    ctx.fillStyle = p.frame
    ctx.fillRect(x + 118, 44, 4, 120)
  })
  pillars(ctx, p, camX, 240)
  floor(ctx, p)
}

/** 2F：拱形窗（窗外夜空）、金色柱子與幾個柔和的大圓形燈。 */
function casino(ctx: CanvasRenderingContext2D, p: Palette, camX: number, t: number): void {
  wall(ctx, p)
  repeat(camX, 260, 0.7, (x) => {
    const cx = x + 130
    ctx.save()
    ctx.beginPath()
    ctx.moveTo(cx - 60, 170)
    ctx.lineTo(cx - 60, 90)
    ctx.arc(cx, 90, 60, Math.PI, 0)
    ctx.lineTo(cx + 60, 170)
    ctx.closePath()
    ctx.clip()
    view(ctx, p, 'casino', cx - 60, 30, 120, 140, camX)
    ctx.restore()
  })
  // 吊燈只畫成柔和的光圈
  repeat(camX, 220, 1, (x, i) => {
    const pulse = 0.18 + 0.04 * Math.sin(t / 30 + i)
    const g = ctx.createRadialGradient(x + 110, 34, 0, x + 110, 34, 46)
    g.addColorStop(0, `rgba(255,240,215,${pulse + 0.25})`)
    g.addColorStop(1, 'rgba(255,240,215,0)')
    ctx.fillStyle = g
    ctx.fillRect(x + 64, 0, 92, 80)
  })
  pillars(ctx, p, camX, 260)
  floor(ctx, p)
}

/** 3F：整面落地窗，窗外冷藍夜景與城市剪影。 */
function office(ctx: CanvasRenderingContext2D, p: Palette, camX: number): void {
  wall(ctx, p)
  const windowH = 140
  view(ctx, p, 'office', 0, CEILING, VIEW_W, windowH, camX)
  ctx.fillStyle = p.frame
  repeat(camX, 160, 1, (x) => ctx.fillRect(x, CEILING, 5, windowH))
  ctx.fillRect(0, CEILING + windowH, VIEW_W, 4)

  // 魔王的大辦公桌：單色剪影
  const desk = 1300 - camX
  if (desk > -100 && desk < VIEW_W + 100) {
    ctx.fillStyle = '#8e9aba'
    ctx.fillRect(desk - 16, GROUND_Y - 56, 32, 28)
    ctx.fillStyle = '#7a87a8'
    ctx.fillRect(desk - 50, GROUND_Y - 30, 100, 8)
    ctx.fillRect(desk - 46, GROUND_Y - 22, 18, 22)
    ctx.fillRect(desk + 28, GROUND_Y - 22, 18, 22)
  }
  floor(ctx, p)
}

/** 樓層終點往上的樓梯與 UP 標示。 */
function stairs(ctx: CanvasRenderingContext2D, p: Palette, camX: number, stairsX: number, t: number): void {
  const x = stairsX - camX - 30
  if (x > VIEW_W || x < -100) return
  ctx.fillStyle = p.pillarShade
  ctx.fillRect(x - 4, 36, 78, GROUND_Y - 36)
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 ? p.floorTop : p.floorBottom
    ctx.fillRect(x + i * 8, GROUND_Y - (i + 1) * 20, 70 - i * 8, 7)
  }
  const pulse = 0.75 + 0.25 * Math.sin(t / 10)
  ctx.fillStyle = `rgba(60,170,100,${pulse})`
  ctx.fillRect(x + 12, 44, 46, 18)
  ctx.font = '8px "Press Start 2P", monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#fff'
  ctx.fillText('UP', x + 35, 54)
}

export function drawBackground(
  ctx: CanvasRenderingContext2D,
  theme: Theme,
  camX: number,
  stairsX: number | null,
  t = 0,
): void {
  const p = PALETTES[theme]
  if (theme === 'casino') casino(ctx, p, camX, t)
  else if (theme === 'office') office(ctx, p, camX)
  else lobby(ctx, p, camX)
  if (stairsX !== null) stairs(ctx, p, camX, stairsX, t)
}

export function drawLobby(ctx: CanvasRenderingContext2D, camX: number): void {
  drawBackground(ctx, 'lobby', camX, null)
}
