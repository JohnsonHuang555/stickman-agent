import { safeLocalStorage } from './leaderboard/leaderboard'

/** 玩家設定：音樂與音效音量（0～1），存在瀏覽器 localStorage。 */
export interface Settings {
  music: number
  sfx: number
}

export const DEFAULT_SETTINGS: Settings = { music: 0.3, sfx: 0.35 }
/** 每按一下 ←／→ 調整的音量。 */
export const VOLUME_STEP = 0.05

const SETTINGS_KEY = 'stickman.settings'

interface KeyValueStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

const STEPS = Math.round(1 / VOLUME_STEP)
/** 限制在 0～1 並對齊 5%（用除法避免 0.6000000000000001 這種浮點誤差）。 */
const clampVolume = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * STEPS) / STEPS

export function loadSettings(store: KeyValueStore | null = safeLocalStorage()): Settings {
  try {
    const raw = store?.getItem(SETTINGS_KEY)
    const parsed = raw ? (JSON.parse(raw) as Partial<Settings>) : {}
    return {
      music: typeof parsed.music === 'number' ? clampVolume(parsed.music) : DEFAULT_SETTINGS.music,
      sfx: typeof parsed.sfx === 'number' ? clampVolume(parsed.sfx) : DEFAULT_SETTINGS.sfx,
    }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(settings: Settings, store: KeyValueStore | null = safeLocalStorage()): void {
  try {
    store?.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    // 存不進去就只在這次遊玩有效
  }
}

/** 調整其中一項音量，限制在 0～1、對齊 VOLUME_STEP。 */
export function adjustVolume(settings: Settings, key: keyof Settings, steps: number): Settings {
  return { ...settings, [key]: clampVolume(settings[key] + steps * VOLUME_STEP) }
}

/** 設定畫面列出的操作說明（取代原本遊戲畫面底部的按鍵提示）。 */
export const CONTROL_GROUPS: readonly { title: string; items: readonly [keys: string, action: string][] }[] = [
  {
    title: '基本操作',
    items: [
      ['A D', '移動'],
      ['A D 連按兩下', '跑步（按住）'],
      ['W', '跳（貼牆再按：蹬牆跳）'],
      ['S', '蹲下'],
      ['Shift', '閃身步（閃過攻擊 → J／K 反擊）'],
      ['J', '拳（連按三段拳）'],
      ['K', '踢'],
      ['L', '撿／丟；空手時抓住敵人'],
      ['V', '背包'],
      ['P／ESC', '暫停與設定'],
    ],
  },
  {
    title: '招式',
    items: [
      ['S → W + J', '挑空技'],
      ['D D + J', '衝刺拳（跑步中 J）'],
      ['跑步中 K', '跑步飛踢'],
      ['K K 快速連按', '踢下體'],
      ['S + J／S + K', '蹲拳／掃腿'],
      ['空中 J → J → K', '空中連段'],
      ['空中 S + J', '下砸拳'],
      ['空中 A D + K', '飛踢'],
      ['W + J／K', '跳起來出招'],
      ['J + K + L', '保命招'],
    ],
  },
  {
    title: '抓住敵人後',
    items: [
      ['J', '膝撞'],
      ['K', '往前摔'],
      ['後 + K', '過肩摔'],
      ['前後前 + K', '大風車'],
      ['被抓時狂按', '掙脫'],
    ],
  },
]
