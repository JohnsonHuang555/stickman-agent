import { describe, expect, it } from 'vitest'
import { MOVES } from './agent/moves'
import type { ActionDef } from './combat/types'
import { BOSS_MOVES } from './enemies/bossMoves'
import { ENEMY_MOVES } from './enemies/enemyMoves'
import { itemAction } from './items/itemActions'
import { ITEM_TYPES, newItem, type ItemTypeId } from './items/itemTypes'
import type { Pose } from './stickman/pose'

const ITEM_ACTIONS: [string, ActionDef][] = (Object.keys(ITEM_TYPES) as ItemTypeId[]).flatMap((type) =>
  (['agent', 'enemy'] as const).flatMap((user): [string, ActionDef][] => [
    [`${user} ${type}`, itemAction(newItem(type), user)],
    [`${user} ${type} (empty)`, itemAction(newItem(type, 0), user)],
  ]),
)

const ALL: [string, ActionDef][] = [
  ...Object.entries(MOVES).map(([n, d]): [string, ActionDef] => [`agent ${n}`, d]),
  ...Object.entries(ENEMY_MOVES).map(([n, d]): [string, ActionDef] => [`enemy ${n}`, d]),
  ...Object.entries(BOSS_MOVES).map(([n, d]): [string, ActionDef] => [`boss ${n}`, d]),
  ...ITEM_ACTIONS,
]

/** 角度換到 [0, 360)，-280° 和 80° 在畫面上是同一個方向。 */
const norm = (deg: number) => Number((((deg % 360) + 360) % 360).toFixed(6))
const canonical = (p: Pose) => ({
  lean: norm(p.lean),
  lift: p.lift,
  limbs: [p.armF, p.armB, p.legF, p.legB].map(([a, b]) => [norm(a), norm(b)]),
})

describe('every move animation finishes exactly on its last pose (regression for "the flying kick never reached its pose")', () => {
  it.each(ALL)('%s', (_name, def) => {
    const last = def.clip.keys[def.clip.keys.length - 1].pose
    expect(canonical(def.clip.sample(100_000))).toEqual(canonical(last))
  })
})
