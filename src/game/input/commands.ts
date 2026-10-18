import type { Button, Press } from './buttons'

export type Facing = 1 | -1

export type CommandKind =
  | 'punch'
  | 'kick'
  | 'desperation'
  | 'launcher'
  | 'airPunch'
  | 'airKick'
  | 'flyingKick'
  | 'diveSmash'
  | 'dashPunch'
  | 'sweep'
  | 'crouchPunch'

export interface Command {
  kind: CommandKind
  /** 衝刺拳、飛踢的方向。 */
  dir?: Facing
}

/** 保命招（Z＋X＋C）視為「同時按」的幀數容許（約 50ms）。 */
export const SIMULTANEOUS_WINDOW = 3
const DESPERATION_BUTTONS: readonly Button[] = ['punch', 'kick', 'grab']
/** 雙擊方向鍵的間隔上限，以及第二擊到出拳的間隔上限。 */
export const DOUBLE_TAP_WINDOW = 14

export interface CommandContext {
  frame: number
  presses: readonly Press[]
  airborne: boolean
  crouching: boolean
  /** 正按著 ↑（挑空技）。 */
  up?: boolean
  /** 正按著 ↓（空中下砸拳）。 */
  down?: boolean
  /** 目前壓著的按鍵；保命招需要三鍵同時壓住。省略時不檢查。 */
  held?: ReadonlySet<Button>
}

/** 依本幀按下的攻擊鍵與最近的按鍵紀錄，判定要出什麼招。 */
export function recognizeCommand(ctx: CommandContext): Command | null {
  const pressedNow = (b: Button) => ctx.presses.some((p) => p.button === b && p.frame === ctx.frame)
  const punch = pressedNow('punch')
  const kick = pressedNow('kick')
  const grab = pressedNow('grab')
  if (!punch && !kick && !grab) return null

  // 空中：X 空中踢；←/→+X 往該方向飛踢；Z 空中拳（可接成空中連段）；↓+Z 下砸拳
  if (ctx.airborne) {
    if (kick) {
      const left = ctx.held?.has('left') ?? false
      const right = ctx.held?.has('right') ?? false
      if (left !== right) return { kind: 'flyingKick', dir: right ? 1 : -1 }
      return { kind: 'airKick' }
    }
    if (punch) return { kind: ctx.down ? 'diveSmash' : 'airPunch' }
    return null
  }

  // 保命招：Z、X、C 三鍵在 SIMULTANEOUS_WINDOW 幀內按下，而且最後一個按下時其他兩個都還壓著
  const recently = (b: Button) =>
    ctx.presses.some((p) => p.button === b && p.frame <= ctx.frame && ctx.frame - p.frame <= SIMULTANEOUS_WINDOW)
  const stillHeld = (b: Button) => !ctx.held || ctx.held.has(b) || pressedNow(b)
  if (DESPERATION_BUTTONS.every((b) => recently(b) && stillHeld(b))) return { kind: 'desperation' }

  if (!punch && !kick) return null
  // 蹲著：Z 蹲拳（腿不動）、X 掃腿（不會站起來）
  if (ctx.crouching) return { kind: kick ? 'sweep' : 'crouchPunch' }
  if (kick) return { kind: 'kick' }
  if (ctx.up) return { kind: 'launcher' }

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
