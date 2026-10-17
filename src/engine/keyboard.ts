import { KEYMAP, type Button, type InputSnapshot } from '../game/input/buttons'

/** 把鍵盤事件轉成每幀一次的輸入快照。 */
export class Keyboard {
  private held = new Set<Button>()
  private pressed: Button[] = []

  attach(target: Window): void {
    target.addEventListener('keydown', (e) => {
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
}
