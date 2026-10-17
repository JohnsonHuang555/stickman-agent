/** consumable：走過去自動撿起並立即生效（醫療箱、分數道具）。 */
export type ItemCategory = 'melee' | 'firearm' | 'throwable' | 'ammo' | 'consumable'

export type ItemTypeId =
  | 'bat'
  | 'crowbar'
  | 'knife'
  | 'katana'
  | 'pistol'
  | 'shotgun'
  | 'chair'
  | 'cabinet'
  | 'desk'
  | 'ammo'
  | 'medkit'
  | 'cash'
  | 'gold'

/** 被丟出時的飛行與傷害。 */
export interface ThrowSpec {
  vx: number
  vh: number
  /** 直線飛行的距離；超過後才受重力影響（小刀）。0 表示一出手就是拋物線。 */
  straight: number
  damage: number
  knockdown: boolean
  /** 穿透多人（櫃子）。 */
  pierce?: boolean
  /** 命中或落地即碎掉消失（投擲物）。 */
  breaks: boolean
  /** 判定框大小。 */
  w: number
  h: number
}

export interface ItemTypeDef {
  label: string
  category: ItemCategory
  /** 近戰武器：耐久度；槍械：滿彈數；投擲物：1；彈藥包：補充的子彈數；醫療箱：補血量；分數道具：分數。 */
  uses: number
  throw: ThrowSpec
  /** 持有時移動速度倍率，且無法跳躍（櫃子）。 */
  heavy?: boolean
  /** 碎裂時的碎片顏色。 */
  debris: string
}

const WEAPON_THROW: ThrowSpec = { vx: 5, vh: 2.2, straight: 0, damage: 10, knockdown: true, breaks: false, w: 14, h: 8 }

export const ITEM_TYPES: Readonly<Record<ItemTypeId, ItemTypeDef>> = {
  bat: { label: 'BAT', category: 'melee', uses: 10, throw: WEAPON_THROW, debris: '#9b6b3c' },
  crowbar: { label: 'CROWBAR', category: 'melee', uses: 15, throw: WEAPON_THROW, debris: '#555' },
  knife: {
    label: 'KNIFE',
    category: 'melee',
    uses: 12,
    throw: { vx: 7, vh: 0, straight: 220, damage: 16, knockdown: false, breaks: false, w: 10, h: 4 },
    debris: '#ccc',
  },
  katana: { label: 'KATANA', category: 'melee', uses: 8, throw: WEAPON_THROW, debris: '#ddd' },
  pistol: { label: 'PISTOL', category: 'firearm', uses: 8, throw: WEAPON_THROW, debris: '#333' },
  shotgun: { label: 'SHOTGUN', category: 'firearm', uses: 4, throw: WEAPON_THROW, debris: '#333' },
  chair: {
    label: 'CHAIR',
    category: 'throwable',
    uses: 1,
    throw: { vx: 4.2, vh: 3.2, straight: 0, damage: 14, knockdown: true, breaks: true, w: 16, h: 16 },
    debris: '#9b6b3c',
  },
  cabinet: {
    label: 'CABINET',
    category: 'throwable',
    uses: 1,
    heavy: true,
    throw: { vx: 3.2, vh: 2.2, straight: 0, damage: 22, knockdown: true, pierce: true, breaks: true, w: 18, h: 22 },
    debris: '#7d8590',
  },
  /** 只有魔王 Johnson 會丟。 */
  desk: {
    label: 'DESK',
    category: 'throwable',
    uses: 1,
    heavy: true,
    throw: { vx: 4, vh: 2.6, straight: 0, damage: 26, knockdown: true, pierce: true, breaks: true, w: 30, h: 18 },
    debris: '#5a3a1e',
  },
  ammo: {
    label: 'AMMO',
    category: 'ammo',
    uses: 4,
    throw: WEAPON_THROW,
    debris: '#6b7a3a',
  },
  /** 補一條命條的 40%。 */
  medkit: { label: 'MEDKIT', category: 'consumable', uses: 40, throw: WEAPON_THROW, debris: '#fff' },
  cash: { label: 'CASH', category: 'consumable', uses: 500, throw: WEAPON_THROW, debris: '#4a8a3a' },
  gold: { label: 'GOLD', category: 'consumable', uses: 1000, throw: WEAPON_THROW, debris: '#e8c33a' },
}

/** 一件具體的物件（含剩餘耐久度或子彈）。 */
export interface Item {
  type: ItemTypeId
  uses: number
}

export function newItem(type: ItemTypeId, uses = ITEM_TYPES[type].uses): Item {
  return { type, uses }
}

export const categoryOf = (item: Item) => ITEM_TYPES[item.type].category
