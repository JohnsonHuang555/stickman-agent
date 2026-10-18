export type Button =
  | 'left'
  | 'right'
  | 'up'
  | 'down'
  | 'punch'
  | 'kick'
  | 'jump'
  | 'grab'
  | 'pause'
  | 'debug'
  | 'confirm'
  | 'bag'
  | 'dodge'

/**
 * 鍵盤配置：WASD 移動（W 跳）、J 拳、K 踢、L 撿／丟／抓、Left Shift 閃身步、V 背包。
 * 方向鍵也能移動與選單操作；沒有獨立的跳躍鍵（'jump' 只在程式內部與測試使用）。
 */
export const KEYMAP: Readonly<Record<string, Button>> = {
  KeyA: 'left',
  KeyD: 'right',
  KeyW: 'up',
  KeyS: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
  KeyJ: 'punch',
  KeyK: 'kick',
  KeyL: 'grab',
  ShiftLeft: 'dodge',
  ShiftRight: 'dodge',
  Escape: 'pause',
  KeyP: 'pause',
  Backquote: 'debug',
  Enter: 'confirm',
  KeyV: 'bag',
}

/** 一幀的輸入快照。 */
export interface InputSnapshot {
  held: ReadonlySet<Button>
  /** 本幀新按下的按鍵（不含自動重複）。 */
  pressed: readonly Button[]
}

export interface Press {
  button: Button
  frame: number
}

/** 保留最近數十幀的按鍵紀錄，供招式判定使用。 */
export class InputBuffer {
  private items: Press[] = []

  constructor(private readonly keepFrames = 40) {}

  record(snapshot: InputSnapshot, frame: number): void {
    for (const button of snapshot.pressed) this.items.push({ button, frame })
    this.items = this.items.filter((p) => frame - p.frame <= this.keepFrames)
  }

  get presses(): readonly Press[] {
    return this.items
  }
}
