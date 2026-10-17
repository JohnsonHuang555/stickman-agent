import type { Button, Press } from './buttons'

export type Facing = 1 | -1

export type CommandKind =
  | 'punch'
  | 'kick'
  | 'desperation'
  | 'flyingKick'
  | 'diveSmash'
  | 'dashPunch'
  | 'sweep'

export interface Command {
  kind: CommandKind
  /** 衝刺拳的方向。 */
  dir?: Facing
}

/** z、x 視為「同時按」的幀數容許（約 83ms）。 */
export const SIMULTANEOUS_WINDOW = 5
/** 雙擊方向鍵的間隔上限，以及第二擊到出拳的間隔上限。 */
export const DOUBLE_TAP_WINDOW = 14

export interface CommandContext {
  frame: number
  presses: readonly Press[]
  airborne: boolean
  crouching: boolean
}

/** 依本幀按下的攻擊鍵與最近的按鍵紀錄，判定要出什麼招。 */
export function recognizeCommand(ctx: CommandContext): Command | null {
  const pressedNow = (b: Button) => ctx.presses.some((p) => p.button === b && p.frame === ctx.frame)
  const punch = pressedNow('punch')
  const kick = pressedNow('kick')
  if (!punch && !kick) return null

  if (ctx.airborne) return { kind: kick ? 'flyingKick' : 'diveSmash' }

  const other: Button = punch ? 'kick' : 'punch'
  const otherRecently = ctx.presses.some(
    (p) => p.button === other && p.frame <= ctx.frame && ctx.frame - p.frame <= SIMULTANEOUS_WINDOW,
  )
  if (otherRecently) return { kind: 'desperation' }

  if (kick) return { kind: 'kick' }
  if (ctx.crouching) return { kind: 'sweep' }

  const dir = doubleTapDirection(ctx.presses, ctx.frame)
  if (dir) return { kind: 'dashPunch', dir }

  return { kind: 'punch' }
}

/** 最近是否雙擊了 ← 或 →；兩者皆有時取較近的那個。 */
export function doubleTapDirection(presses: readonly Press[], frame: number): Facing | null {
  let best: { dir: Facing; at: number } | null = null
  for (const [button, dir] of [['left', -1], ['right', 1]] as const) {
    const taps = presses
      .filter((p) => p.button === button && p.frame <= frame)
      .map((p) => p.frame)
      .sort((a, b) => a - b)
    if (taps.length < 2) continue
    const second = taps[taps.length - 1]
    const first = taps[taps.length - 2]
    if (second - first <= DOUBLE_TAP_WINDOW && frame - second <= DOUBLE_TAP_WINDOW) {
      if (!best || second > best.at) best = { dir, at: second }
    }
  }
  return best?.dir ?? null
}
