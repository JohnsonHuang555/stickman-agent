import { App } from './app'
import { play, unlockAudio } from './audio/sfx'
import { Keyboard } from './engine/keyboard'
import { startLoop } from './engine/loop'
import { VIEW_H, VIEW_W } from './game/constants'
import { World } from './game/world'
import { LocalLeaderboard } from './leaderboard/leaderboard'
import { loadNickname, saveNickname } from './leaderboard/profile'
import { askNickname } from './ui/nicknameDialog'

const canvas = document.getElementById('game') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!

/**
 * 遊戲邏輯一律使用 480×270 的座標；畫布本身依視窗大小與螢幕解析度（devicePixelRatio）
 * 建立高解析度的像素，每幀用 setTransform 把邏輯座標放大，線條與文字才會清晰。
 */
function fit() {
  const cssScale = Math.min(innerWidth / VIEW_W, innerHeight / VIEW_H)
  const dpr = window.devicePixelRatio || 1
  canvas.style.width = `${Math.floor(VIEW_W * cssScale)}px`
  canvas.style.height = `${Math.floor(VIEW_H * cssScale)}px`
  canvas.width = Math.round(VIEW_W * cssScale * dpr)
  canvas.height = Math.round(VIEW_H * cssScale * dpr)
}
/** 只畫一次的頁面（開發用總覽）在畫布尺寸改變後要重畫，因為改尺寸會清空畫布。 */
let redrawStatic: (() => void) | null = null
addEventListener('resize', () => {
  fit()
  redrawStatic?.()
})
fit()

/** 每次繪圖前呼叫：把邏輯座標對應到實際像素。 */
function beginFrame() {
  ctx.setTransform(canvas.width / VIEW_W, 0, 0, canvas.height / VIEW_H, 0, 0)
}

const params = new URLSearchParams(location.search)

/** 畫一張靜態頁面，並在尺寸改變或字型載入後重畫。 */
function showStatic(draw: (ctx: CanvasRenderingContext2D) => void) {
  redrawStatic = () => {
    beginFrame()
    draw(ctx)
  }
  redrawStatic()
  document.fonts.ready.then(redrawStatic)
}

if (import.meta.env.DEV && params.has('scene')) {
  const floor = Number(params.get('scene')) || 1
  const camX = Number(params.get('cam') ?? 300)
  const combo = Number(params.get('combo') ?? 0)
  import('./dev/sceneGallery').then(({ sceneGallery }) => showStatic(sceneGallery(floor, camX, combo)))
} else if (import.meta.env.DEV && params.has('walk')) {
  import('./dev/walkGallery').then(({ drawWalkGallery }) => showStatic(drawWalkGallery))
} else if (import.meta.env.DEV && params.has('roll')) {
  import('./dev/rollGallery').then(({ drawRollGallery }) => showStatic(drawRollGallery))
} else if (import.meta.env.DEV && params.has('bosses')) {
  import('./dev/bossGallery').then(({ drawBossGallery }) => showStatic(drawBossGallery))
} else if (import.meta.env.DEV && params.has('items')) {
  import('./dev/itemGallery').then(({ drawItemGallery }) => showStatic(drawItemGallery))
} else if (import.meta.env.DEV && params.has('poses')) {
  import('./dev/poseGallery').then(({ drawPoseGallery }) => showStatic(drawPoseGallery))
} else {
  const keyboard = new Keyboard()
  keyboard.attach(window, unlockAudio)

  if (params.has('training')) {
    // 練習場：跳過標題與排行榜
    let world = new World({ mode: 'training' })
    world.sound = play
    startLoop(
      () => {
        world.update(keyboard.poll())
        if (world.restartRequested) {
          world = new World({ mode: 'training' })
          world.sound = play
        }
      },
      () => {
        beginFrame()
        world.render(ctx)
      },
    )
  } else {
    // ?floor=2 直接從 2F 開始（開發用）
    const startFloor = import.meta.env.DEV ? Math.max(0, Number(params.get('floor') ?? 1) - 1) : 0
    const app = new App({
      worldOptions: { mode: 'campaign', startFloor },
      leaderboard: new LocalLeaderboard(),
      askNickname,
      loadNickname,
      saveNickname,
      sound: play,
      onDialogClosed: () => keyboard.clear(),
    })
    startLoop(
      () => app.update(keyboard.poll()),
      () => {
        beginFrame()
        app.render(ctx)
      },
    )
  }
}
