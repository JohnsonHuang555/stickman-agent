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
      ['← →', '移動'],
      ['← → 連按兩下', '跑步（按住）'],
      ['↓', '蹲下'],
      ['空白', '跳（貼牆再按：蹬牆跳）'],
      ['↓ + 空白', '翻滾'],
      ['Z', '拳（連按三段拳）'],
      ['X', '踢'],
      ['C', '撿／丟；空手時抓住敵人'],
      ['V', '背包'],
      ['P／ESC', '暫停與設定'],
    ],
  },
  {
    title: '招式',
    items: [
      ['↑ + Z', '挑空技'],
      ['→→ + Z', '衝刺拳（跑步中 Z）'],
      ['跑步中 X', '跑步飛踢'],
      ['X X 快速連按', '踢下體'],
      ['↓ + Z／↓ + X', '蹲拳／掃腿'],
      ['空中 Z → Z → X', '空中連段'],
      ['空中 ↓ + Z', '下砸拳'],
      ['空中 ←→ + X', '飛踢'],
      ['空白 + Z／X', '跳起來出招'],
      ['Z + X + C', '保命招'],
    ],
  },
  {
    title: '抓住敵人後',
    items: [
      ['Z', '膝撞'],
      ['X', '往前摔'],
      ['後 + X', '過肩摔'],
      ['空白', '大風車'],
    ],
  },
]
