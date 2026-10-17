import { GROUND_Y, VIEW_H, VIEW_W } from '../constants'
import type { Theme } from '../level/floors'

/**
 * 扁平插畫風背景：大塊扁平色塊與柔和漸層、淡色低對比，不畫小細節，讓角色成為畫面焦點。
 * 每層樓只靠色調與幾個大形狀區分：1F 暖米色大廳、2F 淡玫瑰色賭場、3F 黃昏天空的頂樓。
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
    ceiling: '#d9ccb4',
    wallTop: '#f3ebdc',
    wallBottom: '#e8dcc6',
    sky: ['#cfe0ee', '#eef2f0'],
    cityFar: '#c3d3e2',
    cityNear: '#adc0d3',
    frame: '#c9b99c',
    pillar: '#e6dac4',
    pillarShade: '#d8caaf',
    floorTop: '#d6c8ae',
    floorBottom: '#bfae91',
    floorLine: '#a8977a',
  },
  casino: {
    ceiling: '#c99aa0',
    wallTop: '#f2dcdc',
    wallBottom: '#e8c8ca',
    sky: ['#f0c9d2', '#f7e4e2'],
    cityFar: '#e2b3bd',
    cityNear: '#d29cab',
    frame: '#c98f98',
    pillar: '#e6bfc3',
    pillarShade: '#d9aab0',
    floorTop: '#cf9aa2',
    floorBottom: '#b47c86',
    floorLine: '#9c6670',
  },
  office: {
    ceiling: '#8f86a8',
    wallTop: '#ece2da',
    wallBottom: '#e0d3c8',
    sky: ['#b9add6', '#f6c9a6'],
    cityFar: '#a99fc6',
    cityNear: '#8b81ab',
    frame: '#9a8fae',
    pillar: '#d9cdc6',
    pillarShade: '#cbbdb5',
    floorTop: '#cbbcb0',
    floorBottom: '#ae9d90',
    floorLine: '#958478',
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

/** 窗外景色：天空漸層＋兩層城市剪影（3F 另加夕陽）。 */
function view(ctx: CanvasRenderingContext2D, p: Palette, theme: Theme, x: number, y: number, w: number, h: number, camX: number): void {
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.clip()
  ctx.fillStyle = vGradient(ctx, y, y + h, p.sky[0], p.sky[1])
  ctx.fillRect(x, y, w, h)
  if (theme === 'office') {
    ctx.fillStyle = 'rgba(255,226,180,0.9)'
    ctx.beginPath()
    ctx.arc(360 - camX * 0.04, y + h * 0.62, 18, 0, Math.PI * 2)
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

/** 2F：拱形窗與幾個柔和的大圓形燈。 */
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

/** 3F：整面落地窗，窗外黃昏與城市剪影。 */
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
    ctx.fillStyle = '#b3a296'
    ctx.fillRect(desk - 16, GROUND_Y - 56, 32, 28)
    ctx.fillStyle = '#9e8c80'
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
