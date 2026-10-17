const STEP_MS = 1000 / 60
const MAX_STEPS_PER_FRAME = 5

/** 固定 60Hz 的邏輯更新，渲染跟著 requestAnimationFrame。 */
export function startLoop(step: () => void, render: () => void): void {
  let acc = 0
  let last = performance.now()
  const frame = (now: number) => {
    acc += Math.min(now - last, 250)
    last = now
    let steps = 0
    while (acc >= STEP_MS && steps < MAX_STEPS_PER_FRAME) {
      step()
      acc -= STEP_MS
      steps++
    }
    if (steps === MAX_STEPS_PER_FRAME) acc = 0
    render()
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
}
