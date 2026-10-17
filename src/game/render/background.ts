import { GROUND_Y, VIEW_H, VIEW_W } from '../constants'
import type { Theme } from '../level/floors'

/**
 * 三層樓的背景。共同原則：
 * - 牆面最下方 LOWER_WALL 高的區域（角色身體所在）用中等亮度的顏色，黑色特務與彩色敵人都看得清楚
 * - 遠景以視差捲動，越遠越慢
 * - t 為幀數，用來做燈光閃爍、拉霸機、星星等小動畫
 */
const LOWER_WALL = 46
const CEILING = 22

/** 0..1 的固定雜湊，讓同一個位置每次畫出一樣的變化。 */
const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return s - Math.floor(s)
}

/** 每隔 step 重複呼叫 draw(螢幕 x, 第幾個)；parallax 越小代表越遠。 */
function repeat(camX: number, step: number, parallax: number, draw: (x: number, index: number) => void, margin = step): void {
  const offset = camX * parallax
  const first = Math.floor((offset - margin) / step)
  const last = Math.ceil((offset + VIEW_W + margin) / step)
  for (let i = first; i <= last; i++) draw(i * step - offset, i)
}

function vGradient(ctx: CanvasRenderingContext2D, y0: number, y1: number, stops: [number, string][]): CanvasGradient {
  const g = ctx.createLinearGradient(0, y0, 0, y1)
  for (const [at, color] of stops) g.addColorStop(at, color)
  return g
}

/** 圓形光暈；color 內以 ALPHA 標示透明度的位置。 */
function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha: number): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r)
  g.addColorStop(0, color.replace('ALPHA', String(alpha)))
  g.addColorStop(1, color.replace('ALPHA', '0'))
  ctx.fillStyle = g
  ctx.fillRect(x - r, y - r, r * 2, r * 2)
}

/** 由天花板往下打的光錐。 */
function lightCone(ctx: CanvasRenderingContext2D, x: number, top: number, topW: number, bottomW: number, alpha: number): void {
  ctx.fillStyle = vGradient(ctx, top, GROUND_Y, [
    [0, `rgba(255,244,214,${alpha})`],
    [1, 'rgba(255,244,214,0)'],
  ])
  ctx.beginPath()
  ctx.moveTo(x - topW / 2, top)
  ctx.lineTo(x + topW / 2, top)
  ctx.lineTo(x + bottomW / 2, GROUND_Y)
  ctx.lineTo(x - bottomW / 2, GROUND_Y)
  ctx.closePath()
  ctx.fill()
}

/** 城市天際線：一排高低不一的大樓剪影，窗戶隨機亮燈。 */
function skyline(
  ctx: CanvasRenderingContext2D,
  camX: number,
  parallax: number,
  baseY: number,
  maxH: number,
  color: string,
  lit: string,
  seed: number,
  t: number,
): void {
  repeat(camX, 30, parallax, (x, i) => {
    const h = maxH * (0.35 + hash(i + seed) * 0.65)
    const w = 22 + hash(i * 3 + seed) * 10
    ctx.fillStyle = color
    ctx.fillRect(x, baseY - h, w, h)
    ctx.fillStyle = lit
    for (let wy = 5; wy < h - 4; wy += 6) {
      for (let wx = 3; wx < w - 3; wx += 5) {
        if (hash(i * 31 + wx * 0.37 + wy * 1.7 + seed) > 0.72) ctx.fillRect(x + wx, baseY - h + wy, 2, 3)
      }
    }
    // 高樓頂的紅色航空警示燈
    if (h > maxH * 0.85 && Math.floor(t / 40 + i) % 2 === 0) {
      ctx.fillStyle = '#ff3b3b'
      ctx.fillRect(x + w / 2 - 1, baseY - h - 3, 2, 2)
    }
  })
}

/** 夜空（含月亮、星星、兩層天際線），畫在指定的窗框範圍內。 */
function nightView(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, camX: number, t: number): void {
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.clip()
  ctx.fillStyle = vGradient(ctx, y, y + h, [
    [0, '#0a0f2c'],
    [0.7, '#2a2350'],
    [1, '#5a3a5c'],
  ])
  ctx.fillRect(x, y, w, h)
  for (let i = 0; i < 60; i++) {
    const sx = (((hash(i) * 900 - camX * 0.05) % 900) + 900) % 900 - 200
    const sy = y + hash(i + 50) * h * 0.6
    const twinkle = 0.4 + 0.6 * Math.abs(Math.sin(t / 30 + i))
    ctx.fillStyle = `rgba(255,255,255,${twinkle})`
    ctx.fillRect(sx, sy, 1, 1)
  }
  const mx = 380 - camX * 0.03
  glow(ctx, mx, y + 26, 26, 'rgba(255,248,220,ALPHA)', 0.35)
  ctx.fillStyle = '#fff6d8'
  ctx.beginPath()
  ctx.arc(mx, y + 26, 9, 0, Math.PI * 2)
  ctx.fill()
  skyline(ctx, camX, 0.15, y + h, h * 0.75, '#1c2147', 'rgba(255,214,120,0.55)', 7, t)
  skyline(ctx, camX, 0.3, y + h, h * 0.55, '#11142e', 'rgba(255,224,140,0.9)', 31, t)
  ctx.restore()
}

function vignette(ctx: CanvasRenderingContext2D): void {
  const g = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.45, VIEW_W / 2, VIEW_H / 2, VIEW_W * 0.65)
  g.addColorStop(0, 'rgba(0,0,0,0)')
  g.addColorStop(1, 'rgba(0,0,0,0.35)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, VIEW_W, VIEW_H)
}

function pottedPlant(ctx: CanvasRenderingContext2D, x: number, big = false): void {
  const s = big ? 1.4 : 1
  ctx.fillStyle = '#2f6b35'
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + (i - 2.5) * 0.45
    ctx.beginPath()
    ctx.ellipse(x + Math.cos(a) * 9 * s, GROUND_Y - 22 * s + Math.sin(a) * 9 * s, 7 * s, 3 * s, a, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.fillStyle = '#3f8a46'
  ctx.beginPath()
  ctx.ellipse(x, GROUND_Y - 24 * s, 5 * s, 9 * s, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#6b4a2f'
  ctx.fillRect(x - 6 * s, GROUND_Y - 12 * s, 12 * s, 12 * s)
  ctx.fillStyle = '#7d5a3a'
  ctx.fillRect(x - 7 * s, GROUND_Y - 13 * s, 14 * s, 3 * s)
}

function label(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color: string): void {
  ctx.font = `${size}px "Press Start 2P", monospace`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = color
  ctx.fillText(s, x, y)
}

// ── 1F 大廳 ──────────────────────────────────────────

function lobby(ctx: CanvasRenderingContext2D, camX: number, t: number): void {
  ctx.fillStyle = vGradient(ctx, CEILING, GROUND_Y, [
    [0, '#e6dbc2'],
    [1, '#cdbf9f'],
  ])
  ctx.fillRect(0, 0, VIEW_W, GROUND_Y)

  // 落地窗與窗間擺設（視差 0.6，擺設放在兩扇窗之間，不會疊到窗上）
  repeat(camX, 220, 0.6, (x, i) => {
    nightView(ctx, x + 40, 46, 130, 104, camX, t)
    ctx.fillStyle = '#4a3f30'
    ctx.fillRect(x + 36, 42, 138, 4)
    ctx.fillRect(x + 36, 150, 138, 5)
    ctx.fillRect(x + 103, 46, 3, 104)
    ctx.fillStyle = 'rgba(255,255,255,0.06)'
    ctx.beginPath()
    ctx.moveTo(x + 50, 46)
    ctx.lineTo(x + 75, 46)
    ctx.lineTo(x + 55, 150)
    ctx.lineTo(x + 40, 150)
    ctx.fill()

    const gap = x + 217
    const kind = ((i % 3) + 3) % 3
    if (kind === 0) {
      // 電梯
      const top = 96
      const bottom = GROUND_Y - LOWER_WALL
      ctx.fillStyle = '#7f848b'
      ctx.fillRect(gap - 26, top, 52, bottom - top)
      ctx.fillStyle = '#a9aeb5'
      ctx.fillRect(gap - 24, top + 2, 23, bottom - top - 2)
      ctx.fillRect(gap + 1, top + 2, 23, bottom - top - 2)
      ctx.fillStyle = '#222'
      ctx.fillRect(gap - 10, top - 13, 20, 9)
      label(ctx, String(1 + ((Math.floor(t / 90) + i) % 3 + 3) % 3), gap, top - 8, 5, '#ff8a3b')
    } else if (kind === 1) {
      // 掛畫
      ctx.fillStyle = '#6b4a1f'
      ctx.fillRect(gap - 24, 64, 48, 38)
      ctx.fillStyle = '#c86b3c'
      ctx.fillRect(gap - 20, 68, 40, 30)
      ctx.fillStyle = '#e8c27a'
      ctx.beginPath()
      ctx.arc(gap, 82, 7, 0, Math.PI * 2)
      ctx.fill()
    } else {
      // 公司招牌
      ctx.fillStyle = '#2a2420'
      ctx.fillRect(gap - 34, 70, 68, 20)
      label(ctx, 'GANG', gap, 76, 6, '#d4a017')
      label(ctx, 'CORP', gap, 85, 6, '#d4a017')
    }
  })

  // 天花板與吸頂燈
  ctx.fillStyle = vGradient(ctx, 0, CEILING, [
    [0, '#1e1b17'],
    [1, '#3a342b'],
  ])
  ctx.fillRect(0, 0, VIEW_W, CEILING)
  repeat(camX, 160, 1, (x) => {
    ctx.fillStyle = '#fff6d0'
    ctx.fillRect(x + 60, CEILING, 40, 3)
    lightCone(ctx, x + 80, CEILING + 3, 40, 150, 0.12)
  })

  // 下半牆：淺色大理石護牆板（角色身體在這一段）
  ctx.fillStyle = '#d8ccb2'
  ctx.fillRect(0, GROUND_Y - LOWER_WALL, VIEW_W, LOWER_WALL)
  ctx.fillStyle = '#9c8a68'
  ctx.fillRect(0, GROUND_Y - LOWER_WALL, VIEW_W, 3)
  ctx.strokeStyle = 'rgba(120,100,70,0.35)'
  ctx.lineWidth = 1
  repeat(camX, 60, 1, (x) => ctx.strokeRect(x + 4, GROUND_Y - LOWER_WALL + 8, 52, LOWER_WALL - 16))

  // 大理石柱與盆栽（在護牆板前面）
  repeat(camX, 240, 1, (x, i) => {
    const g = ctx.createLinearGradient(x, 0, x + 22, 0)
    g.addColorStop(0, '#efe6d2')
    g.addColorStop(0.5, '#d9ccb0')
    g.addColorStop(1, '#a89878')
    ctx.fillStyle = g
    ctx.fillRect(x, CEILING, 22, GROUND_Y - CEILING)
    ctx.fillStyle = '#8f7f60'
    ctx.fillRect(x - 3, CEILING, 28, 5)
    ctx.fillRect(x - 3, GROUND_Y - 8, 28, 8)
    if (i % 2 === 0) pottedPlant(ctx, x + 44)
  })

  // 拋光大理石地板：棋盤格＋反光
  repeat(camX, 32, 1, (x, i) => {
    ctx.fillStyle = i % 2 === 0 ? '#9a8c74' : '#7c6f5a'
    ctx.fillRect(x, GROUND_Y, 32.5, 19)
    ctx.fillStyle = i % 2 === 0 ? '#7c6f5a' : '#9a8c74'
    ctx.fillRect(x, GROUND_Y + 19, 32.5, VIEW_H - GROUND_Y - 19)
  })
  ctx.fillStyle = vGradient(ctx, GROUND_Y, VIEW_H, [
    [0, 'rgba(255,255,255,0.18)'],
    [1, 'rgba(0,0,0,0.25)'],
  ])
  ctx.fillRect(0, GROUND_Y, VIEW_W, VIEW_H - GROUND_Y)
  ctx.fillStyle = '#4a3f30'
  ctx.fillRect(0, GROUND_Y, VIEW_W, 2)
}

// ── 2F 賭場 ──────────────────────────────────────────

const SIGNS = [
  ['CASINO', '#ff4fd8'],
  ['777', '#3ff0ff'],
  ['JACKPOT', '#ffe14f'],
] as const
const REEL_COLORS = ['#d42a2a', '#2a8ad4', '#2ad46b', '#d4c02a']

function casino(ctx: CanvasRenderingContext2D, camX: number, t: number): void {
  // 紅色菱紋壁紙
  ctx.fillStyle = '#6b1420'
  ctx.fillRect(0, 0, VIEW_W, GROUND_Y)
  ctx.fillStyle = '#5a0f19'
  repeat(camX, 16, 0.95, (x, i) => {
    for (let y = CEILING + 8 + (((i % 2) + 2) % 2) * 8; y < GROUND_Y - LOWER_WALL; y += 16) {
      ctx.beginPath()
      ctx.moveTo(x + 8, y - 5)
      ctx.lineTo(x + 13, y)
      ctx.lineTo(x + 8, y + 5)
      ctx.lineTo(x + 3, y)
      ctx.fill()
    }
  })

  // 霓虹招牌（視差 0.9）
  repeat(camX, 360, 0.9, (x, i) => {
    const [text, color] = SIGNS[((i % 3) + 3) % 3]
    const on = hash(Math.floor(t / 6) + i * 17) > 0.05
    const c = on ? color : '#552244'
    ctx.font = '14px "Press Start 2P", monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    if (on) {
      ctx.shadowColor = color
      ctx.shadowBlur = 12
    }
    ctx.fillStyle = c
    ctx.fillText(text, x + 180, 56)
    ctx.strokeStyle = c
    ctx.lineWidth = 1.5
    ctx.strokeRect(x + 105, 41, 150, 30)
    ctx.shadowBlur = 0
  })

  // 拉霸機（視差 0.8）
  repeat(camX, 46, 0.8, (x, i) => {
    if (((i % 5) + 5) % 5 === 4) return
    const top = 100
    ctx.fillStyle = '#26262e'
    ctx.fillRect(x + 6, top, 34, GROUND_Y - LOWER_WALL - top)
    ctx.fillStyle = '#c9a227'
    ctx.fillRect(x + 6, top - 5, 34, 6)
    ctx.fillStyle = Math.floor(t / 10 + i) % 3 === 0 ? '#fff3a8' : '#d9b84a'
    ctx.fillRect(x + 18, top - 9, 10, 4)
    ctx.fillStyle = '#efe8cc'
    ctx.fillRect(x + 10, top + 12, 26, 16)
    for (let r = 0; r < 3; r++) {
      ctx.fillStyle = REEL_COLORS[(((Math.floor(t / 4) + r * 2 + i) % 4) + 4) % 4]
      ctx.fillRect(x + 12 + r * 8, top + 15, 6, 10)
    }
    glow(ctx, x + 23, top + 20, 22, 'rgba(255,230,150,ALPHA)', 0.16)
  })

  // 天花板與水晶吊燈
  ctx.fillStyle = '#1a0a0c'
  ctx.fillRect(0, 0, VIEW_W, CEILING)
  ctx.fillStyle = '#c9a227'
  ctx.fillRect(0, CEILING, VIEW_W, 2)
  repeat(camX, 220, 1, (x, i) => {
    const cx = x + 110
    glow(ctx, cx, 40, 64, 'rgba(255,214,140,ALPHA)', 0.3 + Math.sin(t / 20 + i) * 0.03)
    ctx.strokeStyle = '#c9a227'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(cx, CEILING)
    ctx.lineTo(cx, 30)
    ctx.stroke()
    ctx.fillStyle = '#c9a227'
    ctx.fillRect(cx - 16, 30, 32, 3)
    ctx.fillStyle = '#fff4d0'
    for (let k = -3; k <= 3; k++) ctx.fillRect(cx + k * 5 - 1, 34 + Math.abs(k), 2, 4)
  })

  // 下半牆：木質護牆板＋金邊
  ctx.fillStyle = '#b48a5c'
  ctx.fillRect(0, GROUND_Y - LOWER_WALL, VIEW_W, LOWER_WALL)
  ctx.fillStyle = '#c9a227'
  ctx.fillRect(0, GROUND_Y - LOWER_WALL, VIEW_W, 3)
  ctx.strokeStyle = 'rgba(90,55,25,0.45)'
  ctx.lineWidth = 1
  repeat(camX, 48, 1, (x) => ctx.strokeRect(x + 4, GROUND_Y - LOWER_WALL + 8, 40, LOWER_WALL - 16))

  // 輪盤桌
  repeat(camX, 520, 1, (x) => {
    const cx = x + 300
    ctx.fillStyle = '#4a2a14'
    ctx.fillRect(cx - 34, GROUND_Y - 22, 68, 6)
    ctx.fillRect(cx - 28, GROUND_Y - 16, 4, 16)
    ctx.fillRect(cx + 24, GROUND_Y - 16, 4, 16)
    ctx.fillStyle = '#0f6a35'
    ctx.fillRect(cx - 32, GROUND_Y - 25, 64, 4)
    ctx.save()
    ctx.translate(cx - 14, GROUND_Y - 29)
    ctx.scale(1, 0.4)
    ctx.fillStyle = '#3a1d0c'
    ctx.beginPath()
    ctx.arc(0, 0, 10, 0, Math.PI * 2)
    ctx.fill()
    for (let k = 0; k < 8; k++) {
      ctx.fillStyle = k % 2 ? '#c0182c' : '#111'
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.arc(0, 0, 8, t / 8 + (k * Math.PI) / 4, t / 8 + ((k + 1) * Math.PI) / 4)
      ctx.fill()
    }
    ctx.restore()
    for (let k = 0; k < 3; k++) {
      ctx.fillStyle = ['#e33', '#33e', '#eee'][k]
      ctx.fillRect(cx + 4 + k * 7, GROUND_Y - 29, 5, 3)
      ctx.fillRect(cx + 4 + k * 7, GROUND_Y - 32, 5, 2)
    }
  })

  // 紅地毯
  ctx.fillStyle = vGradient(ctx, GROUND_Y, VIEW_H, [
    [0, '#7a1c26'],
    [1, '#3a0a10'],
  ])
  ctx.fillRect(0, GROUND_Y, VIEW_W, VIEW_H - GROUND_Y)
  ctx.fillStyle = 'rgba(201,162,39,0.35)'
  repeat(camX, 24, 1, (x, i) => ctx.fillRect(x + 10, GROUND_Y + 8 + (((i % 2) + 2) % 2) * 14, 3, 3))
  ctx.fillStyle = '#c9a227'
  ctx.fillRect(0, GROUND_Y, VIEW_W, 2)
}

// ── 3F 頂樓 ──────────────────────────────────────────

const BOOK_COLORS = ['#8a2a2a', '#2a4a8a', '#c9a227', '#2a6a3a']

function office(ctx: CanvasRenderingContext2D, camX: number, t: number): void {
  // 整面落地窗外的夜景；窗框底緣高於角色頭頂，黑色特務不會和夜空混在一起
  const windowH = 146
  nightView(ctx, 0, CEILING, VIEW_W, windowH, camX, t)
  ctx.fillStyle = '#2b2118'
  repeat(camX, 120, 1, (x) => ctx.fillRect(x, CEILING, 6, windowH))
  ctx.fillRect(0, CEILING + windowH, VIEW_W, 5)

  const wallTop = CEILING + windowH + 5
  ctx.fillStyle = vGradient(ctx, wallTop, GROUND_Y, [
    [0, '#7a6045'],
    [1, '#a0866a'],
  ])
  ctx.fillRect(0, wallTop, VIEW_W, GROUND_Y - wallTop)

  // 室內擺設
  repeat(camX, 420, 1, (x, i) => {
    const kind = ((i % 3) + 3) % 3
    if (kind === 0) {
      // 書櫃
      ctx.fillStyle = '#3d2b1c'
      ctx.fillRect(x + 150, GROUND_Y - 62, 60, 62)
      for (let s = 0; s < 3; s++) {
        const sy = GROUND_Y - 58 + s * 19
        for (let b = 0; b < 8; b++) {
          ctx.fillStyle = BOOK_COLORS[(((b + s + i) % 4) + 4) % 4]
          ctx.fillRect(x + 154 + b * 6.5, sy + 2 + (b % 3), 5, 13 - (b % 3))
        }
        ctx.fillStyle = '#5a4030'
        ctx.fillRect(x + 152, sy + 15, 56, 2)
      }
    } else if (kind === 1) {
      // 金色雕像
      glow(ctx, x + 208, GROUND_Y - 32, 26, 'rgba(255,214,90,ALPHA)', 0.22)
      ctx.fillStyle = '#3a2a1c'
      ctx.fillRect(x + 196, GROUND_Y - 18, 24, 18)
      ctx.fillStyle = '#d4a017'
      ctx.beginPath()
      ctx.arc(x + 208, GROUND_Y - 44, 5, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillRect(x + 204, GROUND_Y - 39, 8, 21)
      ctx.fillRect(x + 212, GROUND_Y - 46, 3, 12)
    } else {
      pottedPlant(ctx, x + 200, true)
    }
  })

  // 魔王的大辦公桌（3F 底端）
  const desk = 1300 - camX
  if (desk > -100 && desk < VIEW_W + 100) {
    glow(ctx, desk + 31, GROUND_Y - 36, 24, 'rgba(255,230,150,ALPHA)', 0.35)
    ctx.fillStyle = '#2a1a0e'
    ctx.fillRect(desk - 18, GROUND_Y - 58, 36, 30)
    ctx.fillStyle = '#4a2e18'
    ctx.fillRect(desk - 50, GROUND_Y - 30, 100, 8)
    ctx.fillRect(desk - 46, GROUND_Y - 22, 20, 22)
    ctx.fillRect(desk + 26, GROUND_Y - 22, 20, 22)
    ctx.fillStyle = '#c9a227'
    ctx.fillRect(desk + 30, GROUND_Y - 40, 2, 10)
    ctx.fillRect(desk + 26, GROUND_Y - 42, 10, 3)
  }

  // 天花板與嵌燈
  ctx.fillStyle = '#120d09'
  ctx.fillRect(0, 0, VIEW_W, CEILING)
  repeat(camX, 200, 1, (x) => {
    ctx.fillStyle = '#ffe9b0'
    ctx.fillRect(x + 90, CEILING, 20, 2)
    lightCone(ctx, x + 100, CEILING + 2, 20, 110, 0.07)
  })

  // 深色木地板＋魔王區的紅地毯
  ctx.fillStyle = '#4e3b2a'
  ctx.fillRect(0, GROUND_Y, VIEW_W, VIEW_H - GROUND_Y)
  ctx.fillStyle = 'rgba(0,0,0,0.18)'
  repeat(camX, 46, 1, (x, i) => {
    ctx.fillRect(x, GROUND_Y + 2, 1, 18)
    ctx.fillRect(x + 23 * (((i % 2) + 2) % 2), GROUND_Y + 20, 1, VIEW_H - GROUND_Y - 20)
  })
  ctx.fillRect(0, GROUND_Y + 19, VIEW_W, 1)
  const rugL = 1000 - camX
  const rugR = 1400 - camX
  if (rugR > 0 && rugL < VIEW_W) {
    ctx.fillStyle = '#7a1420'
    ctx.fillRect(rugL, GROUND_Y + 4, rugR - rugL, VIEW_H - GROUND_Y - 8)
    ctx.strokeStyle = '#c9a227'
    ctx.lineWidth = 1.5
    ctx.strokeRect(rugL + 4, GROUND_Y + 7, rugR - rugL - 8, VIEW_H - GROUND_Y - 14)
  }
  ctx.fillStyle = vGradient(ctx, GROUND_Y, VIEW_H, [
    [0, 'rgba(255,255,255,0.1)'],
    [1, 'rgba(0,0,0,0.3)'],
  ])
  ctx.fillRect(0, GROUND_Y, VIEW_W, VIEW_H - GROUND_Y)
  ctx.fillStyle = '#1f1710'
  ctx.fillRect(0, GROUND_Y, VIEW_W, 2)
}

/** 樓層終點往上的樓梯與 UP 標示。 */
function stairs(ctx: CanvasRenderingContext2D, camX: number, stairsX: number, t: number): void {
  const x = stairsX - camX - 30
  if (x > VIEW_W || x < -100) return
  ctx.fillStyle = '#15151a'
  ctx.fillRect(x - 4, 36, 78, GROUND_Y - 36)
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 ? '#8a8a8a' : '#a6a6a6'
    ctx.fillRect(x + i * 8, GROUND_Y - (i + 1) * 20, 70 - i * 8, 6)
    ctx.fillStyle = 'rgba(0,0,0,0.3)'
    ctx.fillRect(x + i * 8, GROUND_Y - (i + 1) * 20 + 6, 70 - i * 8, 2)
  }
  glow(ctx, x + 35, 53, 34, 'rgba(60,220,110,ALPHA)', 0.25 + (0.5 + 0.5 * Math.sin(t / 10)) * 0.2)
  ctx.fillStyle = '#1f8a3a'
  ctx.fillRect(x + 12, 44, 46, 18)
  label(ctx, 'UP', x + 35, 54, 8, '#fff')
}

export function drawBackground(
  ctx: CanvasRenderingContext2D,
  theme: Theme,
  camX: number,
  stairsX: number | null,
  t = 0,
): void {
  if (theme === 'casino') casino(ctx, camX, t)
  else if (theme === 'office') office(ctx, camX, t)
  else lobby(ctx, camX, t)
  if (stairsX !== null) stairs(ctx, camX, stairsX, t)
  vignette(ctx)
}

export function drawLobby(ctx: CanvasRenderingContext2D, camX: number): void {
  drawBackground(ctx, 'lobby', camX, null)
}
