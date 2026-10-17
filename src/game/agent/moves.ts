import type { ActionDef } from '../combat/types'
import type { Fighter } from '../fighter'
import { Clip } from '../stickman/clip'
import { ATTACK_POSES, POSES, aerialClip, attackClip } from '../stickman/poses'

const DESPERATION_COST = 8

/** 出拳時往前小踏一步，讓連擊跟得上被打退的敵人。 */
const punchStep = (f: Fighter, frame: number) => {
  f.vx = frame >= 1 && frame <= 3 ? f.facing * 1 : 0
}

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
