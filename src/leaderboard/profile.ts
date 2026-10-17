import { normalizeNickname, safeLocalStorage } from './leaderboard'

const NICKNAME_KEY = 'stickman.nickname'

/** 玩家的暱稱，存在 localStorage；沒設定過為 null。 */
export function loadNickname(): string | null {
  try {
    const raw = safeLocalStorage()?.getItem(NICKNAME_KEY)
    return raw ? normalizeNickname(raw) : null
  } catch {
    return null
  }
}

export function saveNickname(nickname: string): void {
  try {
    safeLocalStorage()?.setItem(NICKNAME_KEY, nickname)
  } catch {
    // 存不進去就只在這次遊玩有效
  }
}
