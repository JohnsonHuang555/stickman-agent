import { App } from './app'
import { useTouchHints } from './game/render/screens'
import { MusicPlayer } from './audio/music'
import { play, setSfxVolume, unlockAudio } from './audio/sfx'
import { loadSettings, saveSettings, type Settings } from './settings'
import { Keyboard } from './engine/keyboard'
import { TouchControls, mergeInput, wantsTouchControls } from './engine/touch'
import { startLoop } from './engine/loop'
import { VIEW_H, VIEW_W } from './game/constants'
import { World } from './game/world'
import { FallbackLeaderboard, FirestoreLeaderboard, firestoreConfigFrom } from './leaderboard/firestore'
import { LocalLeaderboard, type Leaderboard } from './leaderboard/leaderboard'
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
/** 有設定 Firebase（環境變數）就用線上排行榜（本機備援），否則只用本機。 */
function createLeaderboard(): Leaderboard {
  const config = firestoreConfigFrom(import.meta.env)
  return config ? new FallbackLeaderboard(new FirestoreLeaderboard(config), new LocalLeaderboard()) : new LocalLeaderboard()
}

/** 從主畫面捷徑（加入主畫面）開啟：本來就是全螢幕。 */
const isStandalone = () =>
  matchMedia('(display-mode: fullscreen)').matches ||
  matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true

/**
 * 手機每次觸碰：解鎖音效；還不是全螢幕就嘗試切換並鎖定橫向。
 * 瀏覽器只允許在使用者觸碰時切換全螢幕，所以轉成橫向後要點一下畫面；iOS Safari 不支援（請用「加入主畫面」）。
 */
function enterMobileMode(): void {
  unlockAudio()
  if (document.fullscreenElement || !document.fullscreenEnabled || isStandalone()) return
  try {
    void document.documentElement
      .requestFullscreen({ navigationUI: 'hide' })
      .then(() => {
        const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }
        return orientation.lock?.('landscape')
      })
      .catch(() => {})
  } catch {
    // 不支援全螢幕
  }
}

/** 橫向、還沒全螢幕、而且這台瀏覽器可以全螢幕時，上方顯示「點一下畫面即可全螢幕」。 */
function updateFullscreenHint(): void {
  const show =
    document.body.classList.contains('touch') &&
    innerWidth > innerHeight &&
    document.fullscreenEnabled &&
    !document.fullscreenElement &&
    !isStandalone()
  document.body.classList.toggle('fs-hint', show)
}

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
} else if (import.meta.env.DEV && params.has('bosses')) {
  import('./dev/bossGallery').then(({ drawBossGallery }) => showStatic(drawBossGallery))
} else if (import.meta.env.DEV && params.has('items')) {
  import('./dev/itemGallery').then(({ drawItemGallery }) => showStatic(drawItemGallery))
} else if (import.meta.env.DEV && params.has('grabs')) {
  import('./dev/grabStrip').then(({ makeStrip }) => showStatic(makeStrip(params.get('grabs')!)))
} else if (import.meta.env.DEV && params.has('icon')) {
  import('./dev/iconPage').then(({ drawIconPage }) => drawIconPage(Number(params.get('icon')) || 512))
} else if (import.meta.env.DEV && params.has('poses')) {
  import('./dev/poseGallery').then(({ drawPoseGallery }) => showStatic(drawPoseGallery))
} else {
  const keyboard = new Keyboard()
  keyboard.attach(window, unlockAudio)
  // 手機、平板：顯示觸控按鈕；第一次觸碰時解鎖音效、盡量切到全螢幕橫向
  const touch = wantsTouchControls(params) ? new TouchControls(enterMobileMode) : null
  useTouchHints(!!touch)
  if (touch) {
    updateFullscreenHint()
    addEventListener('resize', updateFullscreenHint)
    document.addEventListener('fullscreenchange', updateFullscreenHint)
  }
  const poll = () => mergeInput(keyboard.poll(), touch?.poll() ?? null)

  if (params.has('training')) {
    // 練習場：跳過標題與排行榜
    let world = new World({ mode: 'training' })
    world.sound = play
    startLoop(
      () => {
        world.update(poll())
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
    const music = new MusicPlayer()
    const settings = loadSettings()
    const applySettings = (s: Settings) => {
      setSfxVolume(s.sfx)
      music.setVolume(s.music)
    }
    applySettings(settings)
    const app = new App({
      settings,
      onSettingsChange: (s) => {
        applySettings(s)
        saveSettings(s)
      },
      worldOptions: { mode: 'campaign', startFloor },
      leaderboard: createLeaderboard(),
      askNickname,
      loadNickname,
      saveNickname,
      sound: play,
      music: (track, paused) => music.update(track, paused),
      onDialogClosed: () => keyboard.clear(),
    })
    startLoop(
      () => app.update(poll()),
      () => {
        beginFrame()
        app.render(ctx)
      },
    )
  }
}
