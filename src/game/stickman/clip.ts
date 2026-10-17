import { lerpPose, type Pose } from './pose'

export interface Key {
  pose: Pose
  /** 這個關鍵影格持續的幀數。 */
  dur: number
  /** 從上一格補間到這格所花的幀數，預設等於 dur；攻擊用小值讓動作「啪」一下到位。 */
  blend?: number
}

/** 一段由關鍵影格組成的動畫。 */
export class Clip {
  readonly total: number

  constructor(
    readonly keys: readonly Key[],
    readonly loop = false,
  ) {
    this.total = keys.reduce((sum, k) => sum + k.dur, 0)
  }

  sample(frame: number): Pose {
    const t = this.loop ? frame % this.total : Math.min(frame, this.total - 1)
    let start = 0
    for (let i = 0; i < this.keys.length; i++) {
      const key = this.keys[i]
      if (t < start + key.dur || i === this.keys.length - 1) {
        const prev = i > 0 ? this.keys[i - 1].pose : this.loop ? this.keys[this.keys.length - 1].pose : key.pose
        const blend = key.blend ?? key.dur
        const alpha = blend <= 0 ? 1 : Math.min(1, (t - start + 1) / blend)
        return lerpPose(prev, key.pose, easeOut(alpha))
      }
      start += key.dur
    }
    return this.keys[0].pose
  }
}

export const still = (pose: Pose) => new Clip([{ pose, dur: 1 }])

const easeOut = (t: number) => 1 - (1 - t) * (1 - t)
