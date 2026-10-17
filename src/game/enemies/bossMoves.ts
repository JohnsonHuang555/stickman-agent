import type { ActionDef, HitSpec } from '../combat/types'
import { newItem } from '../items/itemTypes'
import { Clip } from '../stickman/clip'
import { ATTACK_POSES, POSES, attackClip } from '../stickman/poses'

export interface BossMove extends ActionDef {
  /** 與特務距離小於此值才出招。 */
  range: number
  /** 距離小於此值時不出這招（遠程招式）。 */
  minRange?: number
  /** 出完立刻接的下一招（BossMoveId）。 */
  followUp?: string
}

const hit = (from: number, to: number, spec: Omit<HitSpec, 'from' | 'to'>): HitSpec => ({ from, to, ...spec })

/** 預備 windup 幀後往前衝 dash 幀。 */
function charge(windup: number, dash: number, recover: number, speed: number, spec: Omit<HitSpec, 'from' | 'to'>) {
  return {
    clip: attackClip(ATTACK_POSES.dashPunch, windup, dash, recover, undefined, 10),
    length: windup + dash + recover,
    armor: true,
    hit: hit(windup, windup + dash - 1, spec),
    tick: (f, frame) => {
      f.vx = frame >= windup && frame < windup + dash ? f.facing * speed : 0
    },
  } satisfies ActionDef
}

const spinClip = new Clip([
  ...Array.from({ length: 4 }, () => [
    { pose: ATTACK_POSES.spinA[0], dur: 4, blend: 1 },
    { pose: ATTACK_POSES.spinB[0], dur: 4, blend: 1 },
  ]).flat(),
  { pose: POSES.land, dur: 10 },
])

/** 魔王連射：先打三發高的（蹲下躲），再打兩發低的（跳起來躲）。 */
const SPRAY_SHOTS: readonly [frame: number, height: number][] = [
  [22, 28],
  [28, 28],
  [34, 28],
  [46, 9],
  [54, 9],
]

export const BOSS_MOVES = {
  // ── 1F 小 Boss：撬棍 ──
  crowbarSwing: {
    clip: attackClip(ATTACK_POSES.swing, 14, 4, 14, undefined, 8),
    length: 32,
    range: 28,
    hit: hit(14, 17, { box: { forward: 0, up: 12, w: 30, h: 28 }, damage: 16, hitstun: 22, knockback: 2.5, heavy: true }),
  },
  crowbarCharge: {
    ...charge(20, 20, 20, 4.2, { box: { forward: 0, up: 8, w: 18, h: 30 }, damage: 18, hitstun: 24, knockback: 3, knockdown: true, heavy: true }),
    range: 170,
    minRange: 50,
  },
  crowbarSlam: {
    clip: attackClip(ATTACK_POSES.heavySlam, 24, 6, 18, undefined, 14),
    length: 48,
    range: 30,
    armor: true,
    hit: hit(24, 27, { box: { forward: 0, up: 0, w: 32, h: 34 }, damage: 24, hitstun: 26, knockback: 3, knockdown: true, heavy: true }),
  },

  // ── 2F 小 Boss：雙刀劍客 ──
  bladeSlash: {
    clip: attackClip(ATTACK_POSES.swing, 8, 4, 10, undefined, 6),
    length: 22,
    range: 34,
    hit: hit(8, 11, { box: { forward: 0, up: 12, w: 36, h: 28 }, damage: 14, hitstun: 20, knockback: 2 }),
    followUp: 'bladeSlash2',
  },
  bladeSlash2: {
    clip: attackClip(ATTACK_POSES.punch2, 6, 4, 14, undefined, 4),
    length: 24,
    range: 34,
    hit: hit(6, 9, { box: { forward: 0, up: 16, w: 36, h: 20 }, damage: 12, hitstun: 22, knockback: 3, knockdown: true }),
  },
  bladeDash: {
    ...charge(14, 12, 18, 5.5, { box: { forward: 0, up: 14, w: 30, h: 24 }, damage: 16, hitstun: 22, knockback: 3, knockdown: true, heavy: true }),
    range: 150,
    minRange: 40,
  },
  bladeSpin: {
    clip: spinClip,
    length: 42,
    range: 36,
    armor: true,
    hit: hit(8, 30, { box: { forward: -32, up: 4, w: 64, h: 30 }, damage: 14, hitstun: 22, knockback: 3, knockdown: true, heavy: true }),
  },

  // ── 3F 魔王 Johnson ──
  bossJab: {
    clip: attackClip(ATTACK_POSES.punch1, 10, 4, 6, undefined, 6),
    length: 20,
    range: 24,
    hit: hit(10, 12, { box: { forward: 2, up: 27, w: 18, h: 9 }, damage: 10, hitstun: 18, knockback: 0.6 }),
    followUp: 'bossHook',
  },
  bossHook: {
    clip: attackClip(ATTACK_POSES.punch3, 8, 5, 14, undefined, 4),
    length: 27,
    range: 24,
    hit: hit(8, 11, { box: { forward: 0, up: 18, w: 20, h: 24 }, damage: 14, hitstun: 22, knockback: 3, knockdown: true, heavy: true }),
  },
  bossCharge: {
    ...charge(18, 22, 18, 4.6, { box: { forward: 0, up: 8, w: 20, h: 34 }, damage: 18, hitstun: 24, knockback: 3.5, knockdown: true, heavy: true }),
    range: 200,
    minRange: 50,
  },
  bossSpray: {
    clip: new Clip([
      { pose: ATTACK_POSES.aim[0], dur: 20, blend: 10 },
      { pose: ATTACK_POSES.aim[1], dur: 40, blend: 2 },
      { pose: POSES.idleA, dur: 10 },
    ]),
    length: 70,
    range: 280,
    minRange: 60,
    tick: (f, frame, world) => {
      for (const [at, height] of SPRAY_SHOTS) if (frame === at) world.shoot(f, height)
    },
  },
  bossDesk: {
    clip: attackClip(ATTACK_POSES.throw, 22, 6, 14, undefined, 14),
    length: 42,
    range: 230,
    minRange: 40,
    onStart: (f) => {
      f.held = newItem('desk')
    },
    tick: (f, frame, world) => {
      if (frame === 22) world.throwHeld(f)
    },
  },
} satisfies Record<string, BossMove>

export type BossMoveId = keyof typeof BOSS_MOVES
