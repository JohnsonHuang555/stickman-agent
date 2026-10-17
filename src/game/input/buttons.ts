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

export const KEYMAP: Readonly<Record<string, Button>> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
  KeyZ: 'punch',
  KeyX: 'kick',
  Space: 'jump',
  KeyC: 'grab',
  Escape: 'pause',
  KeyP: 'pause',
  Backquote: 'debug',
  Enter: 'confirm',
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
