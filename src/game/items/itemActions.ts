import type { ActionDef, HitSpec } from '../combat/types'
import type { Pose } from '../stickman/pose'
import { ATTACK_POSES, attackClip } from '../stickman/poses'
import { ITEM_TYPES, type Item, type ItemTypeId } from './itemTypes'

export type ItemUser = 'agent' | 'enemy'

interface SwingParams extends Omit<HitSpec, 'from' | 'to' | 'box'> {
  poses: readonly Pose[]
  windup: number
  strike: number
  recover: number
  /** 從身體中心到武器尖端的大約距離（AI 判斷出招距離用）。 */
  reach: number
  /** 武器長度：設定時判定跟著畫面上的武器走。 */
  length?: number
  up?: number
  h?: number
}

/** 敵人的起手比特務長，讓玩家看得出來。 */
const ENEMY_EXTRA = { melee: 8, firearm: 16, throw: 10 } as const

function swing(p: SwingParams, extra: number, itemUse = true): ActionDef {
  const { poses, windup, strike, recover, reach, length, up, h, ...hit } = p
  const w = windup + extra
  return {
    clip: attackClip(poses, w, strike, recover, undefined, extra ? 8 : 2),
    length: w + strike + recover,
    itemUse,
    weaponLength: length,
    hit: { ...hit, from: w, to: w + strike - 1, box: { forward: 0, up: up ?? 12, w: reach, h: h ?? 28 } },
  }
}

const SWINGS: Record<'bat' | 'crowbar' | 'knife' | 'katana', SwingParams> = {
  bat: {
    poses: ATTACK_POSES.swing, windup: 8, strike: 4, recover: 12, reach: 42, length: 20,
    damage: 14, hitstun: 22, knockback: 2.5, knockdown: true, heavy: true,
  },
  crowbar: {
    poses: ATTACK_POSES.swing, windup: 11, strike: 4, recover: 14, reach: 42, length: 20,
    damage: 16, hitstun: 26, knockback: 2.5, heavy: true,
  },
  knife: {
    poses: ATTACK_POSES.punch1, windup: 4, strike: 3, recover: 8, reach: 32, length: 10, up: 22, h: 12,
    damage: 8, hitstun: 16, knockback: 1.2,
  },
  katana: {
    poses: ATTACK_POSES.swing, windup: 9, strike: 4, recover: 12, reach: 50, length: 28,
    damage: 22, hitstun: 26, knockback: 3, knockdown: true, heavy: true,
  },
}

const BUTT: SwingParams = {
  poses: ATTACK_POSES.punch1, windup: 6, strike: 3, recover: 10, reach: 22, up: 26, h: 12,
  damage: 6, hitstun: 16, knockback: 1.5,
}

function fire(windup: number, recover: number, extra: number): ActionDef {
  const w = windup + extra
  return {
    clip: attackClip(ATTACK_POSES.aim, w, 6, recover, undefined, extra ? 8 : 2),
    length: w + 6 + recover,
    tick: (f, frame, world) => {
      if (frame === w) world.fire(f)
    },
  }
}

function throwAction(extra: number): ActionDef {
  const w = 6 + extra
  return {
    clip: attackClip(ATTACK_POSES.throw, w, 6, 10, undefined, extra ? 8 : 2),
    length: w + 16,
    tick: (f, frame, world) => {
      if (frame === w) world.throwHeld(f)
    },
  }
}

function buildActions(user: ItemUser) {
  const e = user === 'enemy' ? ENEMY_EXTRA : { melee: 0, firearm: 0, throw: 0 }
  return {
    bat: swing(SWINGS.bat, e.melee),
    crowbar: swing(SWINGS.crowbar, e.melee),
    knife: swing(SWINGS.knife, e.melee),
    katana: swing(SWINGS.katana, e.melee),
    pistol: fire(4, 10, e.firearm),
    shotgun: fire(8, 18, e.firearm),
    butt: swing(BUTT, e.melee, false),
    throw: throwAction(e.throw),
  }
}

const ACTIONS = { agent: buildActions('agent'), enemy: buildActions('enemy') }

/** 持有物件時按 z 的動作。投擲物一律丟出；沒子彈的槍改用槍托。 */
export function itemAction(item: Item, user: ItemUser): ActionDef {
  const a = ACTIONS[user]
  switch (ITEM_TYPES[item.type].category) {
    case 'melee':
      return a[item.type as keyof typeof SWINGS]
    case 'firearm':
      return item.uses > 0 ? a[item.type as 'pistol' | 'shotgun'] : a.butt
    default:
      return a.throw
  }
}

export function throwActionFor(user: ItemUser): ActionDef {
  return ACTIONS[user].throw
}

/** 敵人 AI 出這招的距離。 */
export function itemRange(item: Item): number {
  const type: ItemTypeId = item.type
  switch (ITEM_TYPES[type].category) {
    case 'melee':
      return SWINGS[type as keyof typeof SWINGS].reach - 4
    case 'firearm':
      if (item.uses <= 0) return BUTT.reach
      return type === 'shotgun' ? 110 : 230
    default:
      return 150
  }
}
