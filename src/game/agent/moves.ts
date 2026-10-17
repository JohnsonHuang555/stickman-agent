import type { ActionDef } from '../combat/types'
import type { Fighter } from '../fighter'
import { Clip } from '../stickman/clip'
import { ATTACK_POSES, POSES, aerialClip, attackClip } from '../stickman/poses'

const DESPERATION_COST = 8

/** 出拳時往前小踏一步，讓連擊跟得上被打退的敵人。 */
const punchStep = (f: Fighter, frame: number) => {
  f.vx = frame >= 1 && frame <= 4 ? f.facing * 0.8 : 0
}

export const MOVES = {
  punch1: {
    clip: attackClip(ATTACK_POSES.punch1, 4, 4, 7),
    length: 15,
    // 拳頭判定到身體前方約 24px（踢腿約 30px）
    hit: { from: 4, to: 6, box: { forward: 2, up: 24, w: 22, h: 10 }, damage: 6, hitstun: 16, knockback: 0.4 },
    tick: punchStep,
    chain: { accept: 3, at: 9, next: 'punch2' },
    cancelToDesperation: true,
  },
  punch2: {
    clip: attackClip(ATTACK_POSES.punch2, 4, 4, 8),
    length: 16,
    hit: { from: 4, to: 6, box: { forward: 2, up: 24, w: 22, h: 10 }, damage: 7, hitstun: 16, knockback: 0.4 },
    tick: punchStep,
    chain: { accept: 3, at: 9, next: 'punch3' },
  },
  punch3: {
    clip: attackClip(ATTACK_POSES.punch3, 6, 6, 12),
    length: 24,
    hit: {
      from: 6,
      to: 9,
      box: { forward: 2, up: 22, w: 24, h: 20 },
      damage: 10,
      hitstun: 20,
      knockback: 3,
      knockdown: true,
      heavy: true,
    },
  },
  kick: {
    clip: attackClip(ATTACK_POSES.kick, 7, 5, 10),
    length: 22,
    // 判定到身體前方約 30px，比拳頭（約 18px）長得多
    hit: { from: 7, to: 10, box: { forward: 2, up: 10, w: 28, h: 12 }, damage: 10, hitstun: 20, knockback: 2.2 },
    cancelToDesperation: true,
    // 出腿時往前小跨一步
    tick: (f, frame) => {
      f.vx = frame >= 5 && frame <= 10 ? f.facing * 1.2 : 0
    },
  },
  flyingKick: {
    clip: aerialClip(ATTACK_POSES.flyingKick, 3),
    length: Infinity,
    aerial: true,
    hit: {
      from: 3,
      to: Infinity,
      box: { forward: 2, up: -2, w: 24, h: 14 },
      damage: 12,
      hitstun: 20,
      knockback: 3,
      knockdown: true,
      heavy: true,
    },
    onStart: (f) => {
      f.vx = f.facing * 2.6
      f.vh = Math.max(f.vh, 1.2)
    },
  },
  diveSmash: {
    clip: aerialClip(ATTACK_POSES.diveSmash, 6),
    length: Infinity,
    aerial: true,
    hit: {
      from: 6,
      to: Infinity,
      box: { forward: -2, up: -6, w: 18, h: 22 },
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
      if (frame === 6) f.vh = -4.5
    },
  },
  dashPunch: {
    clip: attackClip(ATTACK_POSES.dashPunch, 3, 12, 11),
    length: 26,
    hit: {
      from: 3,
      to: 14,
      box: { forward: 2, up: 23, w: 18, h: 10 },
      damage: 12,
      hitstun: 20,
      knockback: 3,
      knockdown: true,
      heavy: true,
    },
    onStart: (f) => {
      f.vx = f.facing * 4.4
    },
    tick: (f, frame) => {
      f.vx = frame > 14 ? 0 : f.vx * 0.94
    },
  },
  sweep: {
    clip: attackClip(ATTACK_POSES.sweep, 5, 6, 13, POSES.crouch),
    length: 24,
    hit: { from: 5, to: 9, box: { forward: 0, up: 0, w: 24, h: 7 }, damage: 8, hitstun: 20, knockback: 1.5, knockdown: true },
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
      box: { forward: -24, up: 4, w: 48, h: 28 },
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
