import type { Button, InputSnapshot } from '../game/input/buttons'

/**
 * 手機觸控操作：左半邊是浮動搖桿（按下的地方就是中心），右邊是攻擊按鈕。
 * 產生的按鍵和鍵盤完全一樣（left/right/up/down/punch/kick/grab/dodge/bag/pause），
 * 所以連按兩下跑步、S → W + J、前後前 + K 這些指令在手機上也照樣能用。
 */

/** 搖桿推多遠（CSS px）才算有方向；往上（跳）要推得比較明確，斜推不會誤跳。 */
export const STICK_DEAD = 14
export const STICK_UP_DEAD = 26
/** 搖桿頭最多離中心多遠。 */
export const STICK_RADIUS = 48

/** 依搖桿偏移（螢幕座標，y 往下為正）決定按著哪些方向。 */
export function stickButtons(dx: number, dy: number): Button[] {
  const out: Button[] = []
  const ax = Math.abs(dx)
  const ay = Math.abs(dy)
  if (ax >= STICK_DEAD && ax >= ay * 0.4) out.push(dx > 0 ? 'right' : 'left')
  if (dy >= STICK_DEAD && dy >= ax * 0.6) out.push('down')
  // 往上：要推得夠遠、而且接近正上方（約 40° 以內），往前斜推不會變成跳
  if (-dy >= STICK_UP_DEAD && -dy >= ax * 1.2) out.push('up')
  return out
}

/** 右邊的按鈕：顯示文字與送出的按鍵（保命招一次送出三個鍵）。 */
interface ButtonDef {
  id: string
  label: string
  sub?: string
  buttons: Button[]
}

const BUTTONS: ButtonDef[] = [
  { id: 'punch', label: '拳', sub: 'J', buttons: ['punch'] },
  { id: 'kick', label: '踢', sub: 'K', buttons: ['kick'] },
  { id: 'grab', label: '抓', sub: 'L', buttons: ['grab'] },
  { id: 'dodge', label: '閃', buttons: ['dodge'] },
  { id: 'bag', label: '包', buttons: ['bag'] },
  { id: 'desperation', label: '保命', buttons: ['punch', 'kick', 'grab'] },
  { id: 'pause', label: '❚❚', buttons: ['pause'] },
]

/** 這台裝置要不要顯示觸控按鈕：主要輸入是觸控（手機、平板），或網址加 ?touch。 */
export function wantsTouchControls(params: URLSearchParams): boolean {
  if (params.has('touch')) return true
  try {
    return matchMedia('(pointer: coarse)').matches
  } catch {
    return false
  }
}

export class TouchControls {
  private stickHeld: Button[] = []
  private buttonHeld = new Map<number, Button[]>()
  private pressed: Button[] = []
  private stickTouch: number | null = null
  private stickOrigin = { x: 0, y: 0 }
  private readonly root: HTMLDivElement
  private readonly base: HTMLDivElement
  private readonly knob: HTMLDivElement

  /**
   * onTouch：每次手指放開時呼叫。瀏覽器只把「手指放開（touchend）」當成允許全螢幕、播放聲音的使用者操作，
   * 手指按下（touchstart）不算，在那時候要求全螢幕會被默默拒絕。
   */
  constructor(onTouch?: () => void) {
    document.body.classList.add('touch')
    this.root = document.createElement('div')
    this.root.id = 'touch-ui'
    this.root.innerHTML = `
      <div class="stick-zone"></div>
      <div class="stick-base"><div class="stick-knob"></div></div>
      ${BUTTONS.map((b) => `<div class="tbtn tbtn-${b.id}" data-btn="${b.id}">${b.label}${b.sub ? `<small>${b.sub}</small>` : ''}</div>`).join('')}`
    document.body.append(this.root)
    this.base = this.root.querySelector('.stick-base')!
    this.knob = this.root.querySelector('.stick-knob')!

    const opts = { passive: false } as const
    this.root.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault()
        for (const t of Array.from(e.changedTouches)) this.touchStart(t)
      },
      opts,
    )
    this.root.addEventListener(
      'touchmove',
      (e) => {
        e.preventDefault()
        for (const t of Array.from(e.changedTouches)) if (t.identifier === this.stickTouch) this.moveStick(t)
      },
      opts,
    )
    const end = (e: TouchEvent) => {
      e.preventDefault()
      for (const t of Array.from(e.changedTouches)) this.touchEnd(t)
    }
    this.root.addEventListener('touchend', (e) => {
      end(e)
      onTouch?.()
    }, opts)
    this.root.addEventListener('touchcancel', end, opts)
  }

  /** 和鍵盤一樣，每幀取一次：目前按著的鍵與這一幀新按下的鍵。 */
  poll(): InputSnapshot {
    const held = new Set<Button>(this.stickHeld)
    for (const buttons of this.buttonHeld.values()) for (const b of buttons) held.add(b)
    const snapshot = { held, pressed: this.pressed }
    this.pressed = []
    return snapshot
  }

  private touchStart(t: Touch): void {
    const el = (document.elementFromPoint(t.clientX, t.clientY) as HTMLElement | null)?.closest<HTMLElement>('.tbtn')
    if (el) {
      const def = BUTTONS.find((b) => b.id === el.dataset.btn)
      if (!def) return
      this.buttonHeld.set(t.identifier, def.buttons)
      this.pressed.push(...def.buttons)
      el.classList.add('down')
      return
    }
    // 左半邊：浮動搖桿
    if (this.stickTouch === null && t.clientX < innerWidth / 2) {
      this.stickTouch = t.identifier
      this.stickOrigin = { x: t.clientX, y: t.clientY }
      this.base.style.left = `${t.clientX}px`
      this.base.style.top = `${t.clientY}px`
      this.base.classList.add('active')
      this.moveStick(t)
    }
  }

  private moveStick(t: Touch): void {
    const dx = t.clientX - this.stickOrigin.x
    const dy = t.clientY - this.stickOrigin.y
    const len = Math.hypot(dx, dy)
    const k = len > STICK_RADIUS ? STICK_RADIUS / len : 1
    this.knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`
    const next = stickButtons(dx, dy)
    // 剛推到的方向算「按下」（連按兩下跑步、前後前等指令靠這個）
    for (const b of next) if (!this.stickHeld.includes(b)) this.pressed.push(b)
    this.stickHeld = next
  }

  private touchEnd(t: Touch): void {
    if (t.identifier === this.stickTouch) {
      this.stickTouch = null
      this.stickHeld = []
      this.knob.style.transform = ''
      this.base.classList.remove('active')
      return
    }
    if (this.buttonHeld.delete(t.identifier)) {
      // 沒有其他手指按著同一個按鈕時，取消按下的樣式
      for (const el of Array.from(this.root.querySelectorAll<HTMLElement>('.tbtn.down'))) {
        const def = BUTTONS.find((b) => b.id === el.dataset.btn)
        const stillHeld = def && [...this.buttonHeld.values()].some((bs) => bs === def.buttons)
        if (!stillHeld) el.classList.remove('down')
      }
    }
  }
}

/** 合併鍵盤與觸控的輸入。 */
export function mergeInput(a: InputSnapshot, b: InputSnapshot | null): InputSnapshot {
  if (!b) return a
  return { held: new Set([...a.held, ...b.held]), pressed: [...a.pressed, ...b.pressed] }
}
