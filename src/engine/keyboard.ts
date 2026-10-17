import { KEYMAP, type Button, type InputSnapshot } from '../game/input/buttons'

/** 打字中的元素（暱稱輸入框）不攔截按鍵。 */
const isTyping = (e: KeyboardEvent) => {
  const el = e.target as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
}

/** 把鍵盤事件轉成每幀一次的輸入快照。 */
export class Keyboard {
  private held = new Set<Button>()
  private pressed: Button[] = []

  attach(target: Window, onAnyKey?: () => void): void {
    target.addEventListener('keydown', (e) => {
      onAnyKey?.()
      if (isTyping(e)) return
      const button = KEYMAP[e.code]
      if (!button) return
      e.preventDefault()
      if (e.repeat) return
      this.held.add(button)
      this.pressed.push(button)
    })
    target.addEventListener('keyup', (e) => {
      const button = KEYMAP[e.code]
      if (button) this.held.delete(button)
    })
    target.addEventListener('blur', () => this.held.clear())
  }

  poll(): InputSnapshot {
    const snapshot = { held: new Set(this.held), pressed: this.pressed }
    this.pressed = []
    return snapshot
  }

  /** 對話框關閉後清掉殘留的按鍵，避免誤觸。 */
  clear(): void {
    this.held.clear()
    this.pressed = []
  }
}
