import type { ActionDef } from '../combat/types'
import type { Fighter } from '../fighter'
import { Clip } from '../stickman/clip'
import type { Pose } from '../stickman/pose'
import { ATTACK_POSES, POSES, aerialClip, attackClip } from '../stickman/poses'

const DESPERATION_COST = 8
/** 閃身步：持續幀數、無敵的幀數、初速（約滑 45px）。 */
const DODGE_FRAMES = 14
const DODGE_INVULN = 12
const DODGE_SPEED = 5.6

/** 閃身步：往 dir（1 = 面向的方向、-1 = 身後）快速滑開，面向不變，途中短暫無敵。 */
function dodge(poses: readonly [Pose, Pose], dir: 1 | -1) {
  return {
    clip: attackClip(poses, 2, 8, DODGE_FRAMES - 10 + 6, POSES.idleA, 3),
    length: DODGE_FRAMES + 6,
    onStart: (f: Fighter) => {
      f.invuln = DODGE_INVULN
    },
    tick: (f: Fighter, frame: number) => {
      f.vx = frame <= DODGE_FRAMES ? f.facing * dir * DODGE_SPEED * (1 - frame / (DODGE_FRAMES * 1.25)) : 0
    },
  } satisfies ActionDef
}

/** 出拳時往前小踏一步，讓連擊跟得上被打退的敵人。 */
const punchStep = (f: Fighter, frame: number) => {
  f.vx = frame >= 1 && frame <= 3 ? f.facing * 1 : 0
}

/** 跑步飛踢：往前的速度與跳起的高度（約跳 20px、飛 75px）。 */
const RUN_KICK_SPEED = 4.2
const RUN_KICK_HOP = 3.4

/** 被踢到下體後摀著彎腰的幀數（約 1.3 秒）。 */
export const GROIN_STUN = 80

/** 挑空技把雜兵打上空中的初速。 */
// 搭配浮空上升重力 0.22：最高約 71px，接近特務跳躍的最高點
export const LAUNCH_VELOCITY = 5.6

// 判定距離（身體中心到前緣）：拳約 26px、踢約 34px；起手幀數比初版短約 20%
export const MOVES = {
  punch1: {
    clip: attackClip(ATTACK_POSES.punch1, 3, 4, 7),
    length: 14,
    hit: { from: 3, to: 5, box: { forward: 2, up: 28, w: 24, h: 10 }, damage: 6, hitstun: 16, knockback: 0.4 },
    tick: punchStep,
    chain: { accept: 2, at: 8, next: 'punch2' },
    cancelToDesperation: true,
  },
  punch2: {
    clip: attackClip(ATTACK_POSES.punch2, 3, 4, 8),
    length: 15,
    hit: { from: 3, to: 5, box: { forward: 2, up: 28, w: 24, h: 10 }, damage: 7, hitstun: 16, knockback: 0.4 },
    tick: punchStep,
    chain: { accept: 2, at: 8, next: 'punch3' },
  },
  punch3: {
    clip: attackClip(ATTACK_POSES.punch3, 5, 6, 12),
    length: 23,
    hit: {
      from: 5,
      to: 8,
      box: { forward: 2, up: 24, w: 26, h: 24 },
      damage: 10,
      hitstun: 20,
      knockback: 3,
      knockdown: true,
      heavy: true,
    },
  },
  kick: {
    clip: attackClip(ATTACK_POSES.kick, 6, 5, 10),
    length: 21,
    hit: { from: 6, to: 9, box: { forward: 2, up: 12, w: 32, h: 14 }, damage: 10, hitstun: 20, knockback: 2.2 },
    cancelToDesperation: true,
    // 出腿時往前小跨一步
    tick: (f, frame) => {
      f.vx = frame >= 4 && frame <= 9 ? f.facing * 1.4 : 0
    },
  },
  /** Left Shift：往身後閃（沒按方向，或按著身後的方向）。 */
  dodgeBack: dodge(ATTACK_POSES.dodgeBack, -1),
  /** Left Shift + 面向的方向：往前閃，可以閃過敵人。 */
  dodgeForward: dodge(ATTACK_POSES.dodgeForward, 1),
  /** ↑+Z：上勾拳把雜兵打上空中；收招時可按跳取消，跳起來追擊。 */
  launcher: {
    clip: attackClip(ATTACK_POSES.punch3, 4, 6, 16),
    length: 26,
    hit: { from: 4, to: 7, box: { forward: 2, up: 10, w: 26, h: 36 }, damage: 8, hitstun: 24, knockback: 0.6, launch: LAUNCH_VELOCITY },
    jumpCancel: 5,
    tick: punchStep,
  },
  /** 空中連段：Z → Z → X。 */
  airPunch1: {
    clip: attackClip(ATTACK_POSES.airPunch1, 2, 3, 21, POSES.jumpFall),
    // 收招長度只在空中連段時用得到（附近有浮空的敵人）：接下一拳的空間比較寬；
    // 平常跳起來揮空會在第 10 幀提早收招，不會飄在空中
    length: 26,
    aerial: true,
    hit: { from: 2, to: 4, box: { forward: 2, up: -6, w: 28, h: 52 }, damage: 5, hitstun: 18, knockback: 0.6 },
    chain: { accept: 2, at: 6, next: 'airPunch2', on: 'airPunch' },
    airAssist: { hover: true, rise: true, whiffEnd: 10 },
  },
  airPunch2: {
    clip: attackClip(ATTACK_POSES.airPunch2, 2, 3, 23, POSES.jumpFall),
    length: 28,
    aerial: true,
    hit: { from: 2, to: 4, box: { forward: 2, up: -6, w: 28, h: 52 }, damage: 6, hitstun: 18, knockback: 0.6 },
    // 第三下 X：空中踢或飛踢都接成下砸踢
    chain: { accept: 2, at: 6, next: 'airSpike', on: ['airKick', 'flyingKick'] },
    airAssist: { hover: true, rise: true, whiffEnd: 10 },
  },
  airSpike: {
    clip: attackClip(ATTACK_POSES.airSpike, 3, 5, 8, POSES.jumpFall),
    length: 16,
    aerial: true,
    hit: {
      from: 3,
      to: 7,
      // 往下踩：判定向下延伸，敵人掉到腳下也踩得到
      box: { forward: -4, up: -30, w: 34, h: 74 },
      damage: 10,
      hitstun: 24,
      knockback: 1.5,
      knockdown: true,
      heavy: true,
      spike: true,
    },
    airAssist: { rise: true },
  },
  /** 空中單按 X：和飛踢同樣的出腳姿勢，但不往前衝（保留跳躍原本的慣性）。 */
  airKick: {
    clip: attackClip(ATTACK_POSES.airKick, 3, 8, 5, POSES.jumpFall),
    length: 16,
    aerial: true,
    hit: { from: 3, to: 10, box: { forward: 2, up: -4, w: 30, h: 16 }, damage: 9, hitstun: 20, knockback: 2 },
  },
  /** 空中 ←/→ + X：往該方向飛踢衝出去。 */
  flyingKick: {
    clip: aerialClip(ATTACK_POSES.flyingKick, 2),
    length: Infinity,
    aerial: true,
    hit: {
      from: 2,
      to: Infinity,
      box: { forward: 2, up: -4, w: 30, h: 16 },
      damage: 12,
      hitstun: 20,
      knockback: 3,
      knockdown: true,
      heavy: true,
    },
    onStart: (f) => {
      f.vx = f.facing * 3.4
      f.vh = Math.max(f.vh, 1.2)
    },
  },
  diveSmash: {
    clip: aerialClip(ATTACK_POSES.diveSmash, 5),
    length: Infinity,
    aerial: true,
    hit: {
      from: 5,
      to: Infinity,
      box: { forward: -2, up: -6, w: 22, h: 26 },
      damage: 10,
      hitstun: 22,
      knockback: 1.5,
      knockdown: true,
      heavy: true,
    },
    onStart: (f) => {
      f.vx *= 0.4
      f.vh = Math.max(f.vh, 1.5)
    },
    tick: (f, frame) => {
      if (frame === 5) f.vh = -5
    },
  },
  dashPunch: {
    clip: attackClip(ATTACK_POSES.dashPunch, 3, 12, 11),
    length: 26,
    hit: {
      from: 3,
      to: 14,
      box: { forward: 2, up: 26, w: 24, h: 12 },
      damage: 12,
      hitstun: 20,
      knockback: 3,
      knockdown: true,
      heavy: true,
    },
    onStart: (f) => {
      f.vx = f.facing * 5.4
    },
    tick: (f, frame) => {
      f.vx = frame > 14 ? 0 : f.vx * 0.94
    },
  },
  /** 跑步中按 X：從地上低低跳起往前飛踢（擊倒），落地就結束。 */
  runKick: {
    clip: attackClip(ATTACK_POSES.runKick, 3, 4, 20),
    length: 30,
    aerial: true,
    hit: {
      from: 4,
      to: 22,
      box: { forward: 2, up: 4, w: 32, h: 16 },
      damage: 12,
      hitstun: 20,
      knockback: 3,
      knockdown: true,
      heavy: true,
    },
    onStart: (f) => {
      f.vx = f.facing * RUN_KICK_SPEED
      f.vh = RUN_KICK_HOP
    },
  },
  /** 快速連按兩下 X：往前上方踢下體。傷害小，但雜兵會摀著下體彎腰很久。 */
  groinKick: {
    clip: attackClip(ATTACK_POSES.groinKick, 3, 4, 12),
    length: 19,
    hit: {
      from: 3,
      to: 6,
      box: { forward: 2, up: 14, w: 30, h: 12 },
      damage: 4,
      hitstun: GROIN_STUN,
      knockback: 0.3,
      groin: true,
    },
  },
  /** ↓+Z：蹲著出拳，腿不動、身體維持低姿勢，可以連按。 */
  crouchPunch: {
    clip: attackClip(ATTACK_POSES.crouchPunch, 3, 3, 6, POSES.crouch),
    length: 12,
    hit: { from: 3, to: 5, box: { forward: 2, up: 16, w: 24, h: 12 }, damage: 5, hitstun: 14, knockback: 0.4 },
  },
  /** ↓+X：蹲著掃腿，全程不會站起來。 */
  sweep: {
    clip: attackClip(ATTACK_POSES.sweep, 4, 6, 13, POSES.crouch),
    length: 23,
    hit: { from: 4, to: 8, box: { forward: 0, up: 0, w: 32, h: 8 }, damage: 8, hitstun: 20, knockback: 1.5, knockdown: true },
  },
  desperation: {
    clip: new Clip([
      ...Array.from({ length: 4 }, () => [
        { pose: ATTACK_POSES.spinA[0], dur: 4, blend: 1 },
        { pose: ATTACK_POSES.spinB[0], dur: 4, blend: 1 },
      ]).flat(),
      { pose: POSES.land, dur: 6 },
    ]),
    length: 38,
    invuln: true,
    hit: {
      from: 6,
      to: 28,
      box: { forward: -30, up: 4, w: 60, h: 34 },
      damage: 12,
      hitstun: 24,
      knockback: 3,
      knockdown: true,
      heavy: true,
    },
    onStart: (f) => {
      f.life.damage(Math.min(DESPERATION_COST, f.life.hp - 1))
    },
  },
} satisfies Record<string, ActionDef>

export type MoveId = keyof typeof MOVES
