/** 通關時記錄的樓層（高於任何一層）。 */
export const CLEARED_FLOOR = 4
export const ANONYMOUS = 'ANONYMOUS'
export const NICKNAME_MAX = 12

export interface LeaderboardEntry {
  nickname: string
  /** 到達樓層：1–3；通關為 CLEARED_FLOOR。 */
  floor: number
  score: number
  /** 毫秒時間戳。 */
  at: number
}

/** 排序：先比到達樓層，再比分數；都相同時先達成的在前。 */
export function compareEntries(a: LeaderboardEntry, b: LeaderboardEntry): number {
  return b.floor - a.floor || b.score - a.score || a.at - b.at
}

/** 去頭尾空白、壓縮連續空白、截到上限；空字串回傳 null。 */
export function normalizeNickname(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, ' ').slice(0, NICKNAME_MAX)
  return name.length ? name : null
}

/** 同一個暱稱算同一個人（不分大小寫）。 */
export function nicknameKey(nickname: string): string {
  return nickname.trim().toLowerCase()
}

/** 每個暱稱只留最好的一筆（排行榜不重複列出同一個人）。 */
export function bestPerNickname(entries: readonly LeaderboardEntry[]): LeaderboardEntry[] {
  const best = new Map<string, LeaderboardEntry>()
  for (const e of entries) {
    const key = nicknameKey(e.nickname)
    const prev = best.get(key)
    if (!prev || compareEntries(e, prev) < 0) best.set(key, e)
  }
  return [...best.values()].sort(compareEntries)
}

export function floorLabel(floor: number): string {
  return floor >= CLEARED_FLOOR ? 'CLEAR' : `${floor}F`
}

/** 排行榜的儲存方式；目前為本機版，之後換成 Firebase 版。 */
export interface Leaderboard {
  submit(entry: LeaderboardEntry): Promise<void>
  top(limit: number): Promise<LeaderboardEntry[]>
}

interface KeyValueStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

const STORAGE_KEY = 'stickman.leaderboard'
const KEEP = 50

/** 存在瀏覽器 localStorage 的排行榜。讀寫失敗（私密模式等）時當作空的。 */
export class LocalLeaderboard implements Leaderboard {
  constructor(private readonly store: KeyValueStore | null = safeLocalStorage()) {}

  async submit(entry: LeaderboardEntry): Promise<void> {
    // 同一個暱稱只留最好的成績：破紀錄才會取代原本那筆
    const entries = bestPerNickname([...this.read(), entry]).slice(0, KEEP)
    try {
      this.store?.setItem(STORAGE_KEY, JSON.stringify(entries))
    } catch {
      // 寫不進去就算了，不影響遊戲
    }
  }

  async top(limit: number): Promise<LeaderboardEntry[]> {
    return bestPerNickname(this.read()).slice(0, limit)
  }

  private read(): LeaderboardEntry[] {
    try {
      const raw = this.store?.getItem(STORAGE_KEY)
      const parsed: unknown = raw ? JSON.parse(raw) : []
      return Array.isArray(parsed) ? parsed.filter(isEntry) : []
    } catch {
      return []
    }
  }
}

function isEntry(x: unknown): x is LeaderboardEntry {
  const e = x as LeaderboardEntry
  return !!e && typeof e.nickname === 'string' && typeof e.floor === 'number' && typeof e.score === 'number'
}

export function safeLocalStorage(): KeyValueStore | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}
