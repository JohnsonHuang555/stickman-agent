import { WORLD_VIEW_W } from '../constants'
import type { FloorDef, Spawn, ZoneDef } from './floors'

/** 同一波敵人之間錯開出場的幀數。 */
export const SPAWN_STAGGER = 24
/** 一波清空後到下一波出場前的停頓。 */
export const WAVE_PAUSE = 40

/**
 * 控制一層樓的區段進程：
 * 走到區段中央 → 鎖鏡頭 → 依序出波次 → 全滅後解鎖 → 下一個區段。
 */
export class ZoneDirector {
  /** 目前或最近一個觸發過的區段。 */
  zoneIndex = -1
  locked = false
  private wave = 0
  private queue: { spawn: Spawn; at: number }[] = []
  private waveClearedAt: number | null = null

  constructor(readonly floor: FloorDef) {}

  get zone(): ZoneDef | null {
    return this.floor.zones[this.zoneIndex] ?? null
  }

  /** 鎖定中的畫面左緣；未鎖定為 null。 */
  get lockLeft(): number | null {
    return this.locked ? this.zone!.start : null
  }

  get allCleared(): boolean {
    return !this.locked && this.zoneIndex === this.floor.zones.length - 1
  }

  /** 鎖定中、這個區段的最後一波已經全部出場：再打倒場上的敵人就清場了。 */
  get finalWaveOut(): boolean {
    return this.locked && this.queue.length === 0 && this.wave === this.zone!.waves.length - 1
  }

  /** 下一個區段的觸發點（或樓梯）。 */
  get nextTarget(): number {
    const next = this.floor.zones[this.zoneIndex + 1]
    return next ? next.start + WORLD_VIEW_W / 2 : this.floor.stairsX
  }

  /** 剛清完一個區段、還沒走到下一個目標時顯示「GO →」。 */
  showGo(agentX: number): boolean {
    return !this.locked && this.zoneIndex >= 0 && agentX < this.nextTarget - WORLD_VIEW_W / 2
  }

  /** 每幀呼叫；回傳本幀該出場的敵人。enemiesAlive 不含正在消失的。 */
  update(frame: number, agentX: number, enemiesAlive: number): Spawn[] {
    if (!this.locked) {
      const next = this.floor.zones[this.zoneIndex + 1]
      if (next && agentX >= next.start + WORLD_VIEW_W / 2) {
        this.zoneIndex++
        this.locked = true
        this.wave = 0
        this.enqueueWave(frame)
      }
    } else if (this.queue.length === 0 && enemiesAlive === 0) {
      if (this.waveClearedAt === null) this.waveClearedAt = frame
      if (frame - this.waveClearedAt >= WAVE_PAUSE || this.wave + 1 >= this.zone!.waves.length) {
        this.waveClearedAt = null
        this.wave++
        if (this.wave < this.zone!.waves.length) this.enqueueWave(frame)
        else this.locked = false
      }
    }

    const due = this.queue.filter((q) => q.at <= frame)
    this.queue = this.queue.filter((q) => q.at > frame)
    return due.map((q) => q.spawn)
  }

  private enqueueWave(frame: number): void {
    this.zone!.waves[this.wave].forEach((spawn, i) => this.queue.push({ spawn, at: frame + i * SPAWN_STAGGER }))
  }
}
