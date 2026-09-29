/**
 * @dsh-external/dsh-boot-animation - browser half.
 *
 * Plays the boot video full-frame in two cases:
 *   1. the conversation the user PINNED as their intro session, EVERY time it is
 *      opened (that is the "professional work mode" conversation they return to);
 *   2. a brand new, still-empty conversation, once per conversation.
 *
 * The pin exists because a specific conversation cannot be identified by name
 * from the client: session titles are not part of the session summary the client
 * holds, and asking a human for a session UUID is not a workflow. So the sidebar
 * footer gets one small button that pins whatever conversation is open.
 *
 * Seating:
 *   - `shell.overlay`        the frame-wide floating layer for the animation
 *   - `sidebar.footer.action` the small pin toggle beside Settings
 * Both are list slots, so each is an added cell, never a replacement.
 *
 * Which session is current comes from the ui-session service. Its
 * `adapter.current` store resolves to `{ key, hooks, keyedHooks, props }`, i.e.
 * `props.sessionId` and `hooks.session`. A brand new conversation is
 * `hooks.session.blankBit === true` (`blank` belongs to another package's
 * projected summary and is not on this snapshot).
 *
 * Browser policy, honestly: audio autoplay and the Fullscreen API both require a
 * user gesture, so the animation starts muted inside a fixed full-frame overlay
 * and a click then unmutes AND enters real fullscreen.
 */

import type { ReactElement } from 'react'
import { createElement as h, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'

/** Slot service for both seats, ui-session for the current conversation. */
export const inject = ['slots', 'uiSession']

/**
 * Plays the active clip.
 *
 * The src is a CONSTANT. It used to carry `#<activeId>` so the element would
 * reload when the library selection changed, but the id arrives from an async
 * fetch, so the src changed a moment AFTER the overlay opened — mid-playback.
 * A src change restarts the media load, and the play() effect does not re-run
 * on it, so the result was a black frame that looked like "the video will not
 * load". The fragment bought nothing: the route resolves the active file on
 * every request, so the next time the overlay opens it is already the new clip.
 */
const VIDEO_URL = '/dsh-boot-animation/boot.mp4'
const LIST_URL = '/dsh-boot-animation/videos.json'
const SELECT_URL = '/dsh-boot-animation/select'
const SEEN_KEY = 'dsh-boot-animation:seen'
const PIN_KEY = 'dsh-boot-animation:pinned'
const FIT_KEY = 'dsh-boot-animation:fit'
const MAX_SEEN = 80
/** Never let a stalled video trap the user behind the overlay. */
const STALL_TIMEOUT_MS = 25000

/**
 * The clip's content key, fetched once so the media URL can carry `?v=`.
 *
 * The route is constant but the BYTES behind it are not: this session alone
 * served three different files under `/boot.mp4`. A media cache keyed by that
 * URL, revalidating range requests one at a time, can end up holding a spliced
 * file — and a spliced MP4 does not error, it simply never paints. Pinning the
 * content key into the URL gives every distinct clip its own cache entry, so a
 * stale one cannot exist, and lets the host answer `immutable` rather than
 * `no-cache` (which is what makes the NEXT play instant instead of a round trip).
 *
 * Resolved BEFORE any overlay opens and never during playback: a src that
 * changes after mount restarts the media load while the play() effect does not
 * re-run, which is the black frame this plugin already fixed once.
 */
let activeVersion: string | null = null
let versionStarted = false
function resolveActiveVersion(): void {
  if (versionStarted) return
  versionStarted = true
  void (async () => {
    try {
      const response = await fetch(LIST_URL, { cache: 'no-store' })
      if (!response.ok) return
      const data = (await response.json()) as { activeVersion?: unknown }
      const version = data.activeVersion
      if (typeof version !== 'string' || version === '') return
      activeVersion = version
      log('active version', version)
      // Warm the media cache while nobody is waiting for it: with a versioned
      // URL the host marks this immutable, so the later <video> request is
      // answered from the local copy instead of the network.
      await fetch(videoSrc(), { cache: 'force-cache' })
      notify('media prefetched', videoSrc())
    } catch (error: unknown) {
      notify('prefetch failed', String(error))
    }
  })()
}

/** The URL to play, carrying the content key when it is already known. */
function videoSrc(): string {
  return activeVersion === null ? VIDEO_URL : VIDEO_URL + '?v=' + encodeURIComponent(activeVersion)
}

/**
 * How the clip meets the window: 'cover' fills it and crops the overflow,
 * 'contain' shows the whole frame and leaves black bars. Cover by default,
 * because a splash that leaves bars on a normal monitor reads as broken.
 * Read per overlay open, like the clip choice, so a change lands next playback.
 */
type Fit = 'cover' | 'contain'
function readFit(): Fit {
  try {
    return window.localStorage.getItem(FIT_KEY) === 'contain' ? 'contain' : 'cover'
  } catch {
    return 'cover'
  }
}
function writeFit(fit: Fit): void {
  try {
    window.localStorage.setItem(FIT_KEY, fit)
  } catch {
    /* private mode: it simply does not persist */
  }
}

/** Set to true to narrate every decision the plugin makes in the browser console. */
const DEBUG = false
function formatArgs(args: unknown[]): string {
  return args
    .map((a) => {
      if (typeof a === 'object' && a !== null) {
        try {
          return JSON.stringify(a)
        } catch {
          return String(a)
        }
      }
      return String(a)
    })
    .join(' ')
}
function narrate(text: string): void {
  try {
    console.log('[dsh-boot-animation] ' + text)
  } catch {
    /* console unavailable */
  }
}
function log(...args: unknown[]): void {
  if (!DEBUG) return
  narrate(formatArgs(args))
}

/**
 * The always-on subset. A black overlay reports nothing by itself — no network
 * error, no thrown exception, just a video element that never paints — so the
 * four things needed to diagnose one from the outside are logged unconditionally:
 * which URL the element actually used, when the first frame arrived, when the
 * element errored and with which code, and when the stall watchdog gave up.
 * They are one line each and only fire on a play, so the noise is bounded.
 */
function notify(...args: unknown[]): void {
  narrate(formatArgs(args))
}

function readSeen(): string[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SEEN_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : []
  } catch {
    return []
  }
}

function hasPlayed(sessionId: string): boolean {
  return readSeen().includes(sessionId)
}

function markPlayed(sessionId: string): void {
  try {
    const seen = readSeen()
    if (!seen.includes(sessionId)) seen.push(sessionId)
    while (seen.length > MAX_SEEN) seen.shift()
    window.localStorage.setItem(SEEN_KEY, JSON.stringify(seen))
  } catch {
    /* private mode: it simply replays next time */
  }
}

function readPinned(): string | null {
  try {
    const value = window.localStorage.getItem(PIN_KEY)
    return value === null || value === '' ? null : value
  } catch {
    return null
  }
}

function writePinned(sessionId: string | null): void {
  try {
    if (sessionId === null) window.localStorage.removeItem(PIN_KEY)
    else window.localStorage.setItem(PIN_KEY, sessionId)
  } catch {
    /* private mode: the pin simply does not persist */
  }
}

const STYLE_ID = 'dsh-boot-animation-style'
const CSS = `
.dba-root{position:fixed;inset:0;z-index:2147483000;background:#000;
  display:flex;align-items:center;justify-content:center;
  pointer-events:auto;cursor:pointer;overflow:hidden}
.dba-video{width:100%;height:100%;object-fit:contain;background:#000;display:block}
/* The ONLY difference between the fit modes is object-fit.
   Do not "harden" this with position/inset changes: the bar fix does not need
   them, and an overlay that rendered correctly under flex + percentage sizing
   went fully black in the real app the one time the layout mechanics were
   rewritten for no reason. Minimal change, or you trade a cosmetic defect for
   a functional one.
   NOTE: never put a backtick in this block — the whole sheet is a template
   literal, and one backtick ends it. scripts/check-css-template.mjs enforces it. */
.dba-video.dba-cover{object-fit:cover;object-position:center}
.dba-skip{position:absolute;top:20px;right:22px;z-index:2;
  border:1px solid rgba(255,255,255,.42);background:rgba(0,0,0,.42);
  color:#fff;border-radius:999px;padding:6px 16px;font-size:13px;line-height:1.4;
  font-family:inherit;cursor:pointer}
.dba-skip:hover{background:rgba(0,0,0,.66)}
.dba-hint{position:absolute;bottom:30px;left:50%;transform:translateX(-50%);
  z-index:2;color:rgba(255,255,255,.82);font-size:13px;letter-spacing:.06em;
  font-family:inherit;text-shadow:0 1px 8px rgba(0,0,0,.9);
  animation:dba-breathe 2.4s ease-in-out infinite;white-space:nowrap}
@keyframes dba-breathe{0%,100%{opacity:.55}50%{opacity:1}}
.dba-status{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
  z-index:2;color:rgba(255,255,255,.88);font-size:14px;letter-spacing:.04em;
  font-family:inherit;text-align:center;max-width:78vw;
  background:rgba(0,0,0,.46);border-radius:10px;padding:10px 18px;
  text-shadow:0 1px 10px rgba(0,0,0,.9)}
.dba-pin{display:inline-flex;align-items:center;justify-content:center;
  width:28px;height:28px;padding:0;border:0;border-radius:8px;cursor:pointer;
  background:transparent;color:var(--dsw-alias-text-secondary,var(--dsw-alias-label-secondary,#888));
  font-size:14px;line-height:1;font-family:inherit}
.dba-pin:hover{background:rgba(127,127,127,.16);color:var(--dsw-alias-text-primary,var(--dsw-alias-label-primary,#191919))}
.dba-pin.dba-pin-on{color:#07c160;background:rgba(7,193,96,.14)}
.dba-veil{position:fixed;inset:0;z-index:2147483200;background:rgba(0,0,0,.46);
  display:flex;align-items:center;justify-content:center;padding:24px}
.dba-lib{width:min(560px,100%);max-height:min(90vh,900px);overflow:auto;
  background:var(--dsw-alias-bg-elevated,var(--dsw-alias-bg-layer-2,#fff));color:var(--dsw-alias-text-primary,var(--dsw-alias-label-primary,#191919));
  border:1px solid rgba(127,127,127,.28);border-radius:14px;padding:18px 18px 14px;
  box-shadow:0 18px 60px rgba(0,0,0,.34);font-family:inherit;
  font-size:13px;line-height:1.55}
.dba-lib h3{margin:0 0 4px;font-size:15px;font-weight:600}
.dba-lib p{margin:0 0 6px;color:var(--dsw-alias-text-secondary,var(--dsw-alias-label-secondary,#777));font-size:12.5px}
.dba-item{display:flex;align-items:center;gap:10px;padding:4px 10px;border-radius:9px;
  cursor:pointer;border:1px solid transparent}
.dba-item:hover{background:rgba(127,127,127,.12)}
.dba-item.dba-cur{border-color:rgba(7,193,96,.55);background:rgba(7,193,96,.10)}
.dba-item .dba-nm{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dba-badge{font-size:11px;padding:1px 7px;border-radius:999px;
  background:rgba(127,127,127,.18);color:var(--dsw-alias-text-secondary,var(--dsw-alias-label-secondary,#777));white-space:nowrap}
.dba-badge.dba-b-sel{background:rgba(7,193,96,.16);color:#07974b}
.dba-badge.dba-b-warn{background:rgba(210,120,40,.18);color:#b46214;cursor:help}
.dba-meta{font-size:11.5px;color:var(--dsw-alias-text-secondary,var(--dsw-alias-label-secondary,#999));white-space:nowrap}
.dba-mark{width:16px;text-align:center;color:#07c160;font-weight:700}
.dba-dir{margin:9px 0 0;padding:7px 10px;border-radius:9px;background:rgba(127,127,127,.10);
  font-size:11.5px;color:var(--dsw-alias-text-secondary,var(--dsw-alias-label-secondary,#777));word-break:break-all}
.dba-dir code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11.5px;
  color:var(--dsw-alias-text-primary,var(--dsw-alias-label-primary,#333))}
.dba-bar{display:flex;gap:8px;justify-content:flex-end;margin-top:10px}
.dba-fit{display:flex;align-items:center;gap:8px;margin-top:8px;
  font-size:12px;color:var(--dsw-alias-text-secondary,var(--dsw-alias-label-secondary,#777))}
.dba-btn.dba-btn-on{border-color:rgba(7,193,96,.6);background:rgba(7,193,96,.12);color:#07974b}
.dba-btn.dba-btn-preview{border-color:rgba(7,193,96,.55);color:#07974b;font-weight:600}
.dba-btn.dba-btn-preview:hover{background:rgba(7,193,96,.12)}
.dba-btn{border:1px solid rgba(127,127,127,.34);background:transparent;color:inherit;
  border-radius:8px;padding:5px 14px;font-size:12.5px;font-family:inherit;cursor:pointer}
.dba-btn:hover{background:rgba(127,127,127,.14)}
.dba-msg{margin-top:10px;font-size:12px;min-height:16px;color:var(--dsw-alias-text-secondary,var(--dsw-alias-label-secondary,#777))}
.dba-msg.dba-ok{color:#07974b}
.dba-msg.dba-err{color:#d24a43}
.dba-btn:disabled{opacity:.42;cursor:default}
.dba-btn:disabled:hover{background:transparent}
/* Two role sections in one list. The rows are the same rows as before; only the
   heading tells them apart, and the heading is where the "which one am I
   picking" question gets answered. */
.dba-sec-head{display:flex;align-items:baseline;gap:8px;margin:7px 0 2px;
  padding-bottom:4px;border-bottom:.5px solid var(--dsw-alias-border-l4,rgba(127,127,127,.28))}
.dba-sec-name{font-size:13px;font-weight:600;
  color:var(--dsw-alias-text-primary,var(--dsw-alias-label-primary,#191919))}
.dba-sec-hint{font-size:11.5px;
  color:var(--dsw-alias-text-secondary,var(--dsw-alias-label-secondary,#777))}
/* The workspace skin: the selected clip's last usable frame as a still
   backdrop behind the whole shell.

   The trick is ONE token. --dsw-alias-bg-base is what the AppFrame
   (ui-layout) and the conversation column (ui-conversation) paint, and the
   theme declares it on body for both palettes; making it transparent is what
   lets the layer below show through, while cards and menus keep
   --dsw-alias-bg-layer-1/2 and stay legible.
   --dsw-specific-sidebar-fill is the sidebar column's opaque fill, so only
   the window scope overrides it (to a color-mix, so the sidebar stays a
   surface rather than a hole).

   The layer sits at z-index:-1 with html and body forced transparent: a
   POSITIVE z-index would depend on paint order against the app's own
   positioned surfaces, and the failure mode of guessing that wrong is a
   backdrop that covers the UI. Negative-z can only ever be covered itself.

   bright/scrim are set by JS, not here: the light palette needs the opposite
   direction (lighten a bright frame for dark text), and that depends on
   body[data-ds-dark-theme], which changes while the page is open.

   The skin is TWO stacked layers so that the opacity control means one obvious
   thing: the palette's own base colour sits at the bottom (.dba-skin) and the
   frame sits on top of it (.dba-skin-shot) at --dba-skin-strength. So 0
   (transparency) reads as the app's normal background and 100 as the full
   frame, instead of a half-faded frame over whatever the browser paints as its
   own canvas. The sidebar's fill is mixed with THE SAME variable, which is what
   keeps it in step with the main area.

   NOTE: never put a backtick in this block. */
.dba-skin{position:fixed;inset:0;z-index:-1;pointer-events:none;display:none;
  background:var(--dsw-static-neutral-bluish-00)}
body[data-ds-dark-theme] .dba-skin{background:var(--dsw-static-neutral-bluish-950)}
.dba-skin-shot{position:absolute;inset:0;background-position:center;
  background-size:cover;background-repeat:no-repeat;
  transform:scale(1.08);transform-origin:center;
  opacity:var(--dba-skin-strength,1)}
/* NOTE: there is deliberately NO veil/parchment layer here any more.
   It used to be a second background layer on the shot, which the live video --
   a CHILD of the shot -- painted over, so 静帧 came out washed and 动态 did not.
   Routing it through an ::after made the two modes agree, but it made them agree
   on the WASHED look; the preference is the other way round (the frame at its own
   brightness), so the veil is gone and the two modes now differ only in whether
   the picture moves. Readability is the 透明度 slider's job: it dilutes the frame
   toward the palette's own base colour, which is the same kind of wash but under
   the user's control. */
/* The live layer rides INSIDE .dba-skin-shot, so it inherits the same
   blur/brightness, the same opacity and the same 1.08 scale -- and the shot's own
   background-image stays underneath as the poster, so switching to 动态 never
   flashes an empty backdrop while the video loads. */
.dba-skin-live{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;
  display:none}
html.dba-skin-live-on .dba-skin-live{display:block}
html.dba-skin-on .dba-skin{display:block}
html.dba-skin-on,html.dba-skin-on body{background:transparent!important}
html.dba-skin-on body{--dsw-alias-bg-base:transparent!important}
/* The sidebar column stays a surface, not a hole: it keeps its own fill and
   mixes in only as much transparency as ITS OWN control asks for
   (--dba-skin-sidebar is that fill's alpha, set by paintSkin). It used to be
   derived from the skin's own strength, which meant it could not be dialled
   independently -- and 0% skin plus an opaque sidebar was not expressible. */
html.dba-skin-on.dba-skin-window body{--dsw-specific-sidebar-fill:color-mix(in srgb,var(--dsw-static-neutral-bluish-50) var(--dba-skin-sidebar,65%),transparent)!important}
html.dba-skin-on.dba-skin-window body[data-ds-dark-theme]{--dsw-specific-sidebar-fill:color-mix(in srgb,var(--dsw-static-neutral-bluish-900) var(--dba-skin-sidebar,65%),transparent)!important}
.dba-range{flex:1;min-width:130px;max-width:230px;height:18px;margin:0;
  accent-color:#07c160;cursor:pointer}
.dba-range:disabled{opacity:.42;cursor:default}
.dba-num{font-size:12px;min-width:40px;text-align:right;font-variant-numeric:tabular-nums;
  color:var(--dsw-alias-text-secondary,var(--dsw-alias-label-secondary,#777))}
`

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID) !== null) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS
  document.head.appendChild(style)
}

type CurrentStore = {
  getSnapshot: () => unknown
  subscribe: (listener: () => void) => () => void
}

/** Resolved ui-session binding as the built-in source publishes it. */
type Binding = {
  key?: unknown
  hooks?: {
    session?: {
      /** The snapshot's own "this conversation is still empty" flag. */
      blankBit?: unknown
    }
  }
  keyedHooks?: unknown
  props?: { sessionId?: unknown }
}

const noopSubscribe = () => () => {}

/** Subscribe to the current-conversation store, tolerating its absence. */
function useCurrentSession(store: CurrentStore | null): {
  sessionId: string | null
  isNewConversation: boolean
} {
  const binding = useSyncExternalStore(
    store === null ? noopSubscribe : store.subscribe,
    store === null ? () => null : store.getSnapshot,
  ) as Binding | null
  const sessionId = typeof binding?.props?.sessionId === 'string' ? binding.props.sessionId : null
  return { sessionId, isNewConversation: binding?.hooks?.session?.blankBit === true }
}

function BootOverlay({
  store,
  previewAt = 0,
}: {
  store: CurrentStore | null
  /** Bumped by the library's preview button to force a play right now. */
  previewAt?: number
}): ReactElement | null {
  ensureStyle()

  const { sessionId, isNewConversation } = useCurrentSession(store)
  // Decided per open, so a change in the library panel lands on the next play.
  const fit = readFit()

  const [showing, setShowing] = useState(false)
  const [needsTap, setNeedsTap] = useState(false)
  const [phase, setPhase] = useState<'loading' | 'playing' | 'stalled' | 'error'>('loading')
  /**
   * Frozen at mount, deliberately: `videoSrc()` reads a value that resolves from
   * an async fetch, and letting the src change after mount is exactly the black
   * frame bug this plugin already paid for once (see the note above VIDEO_URL).
   */
  const [src] = useState(videoSrc)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const closedRef = useRef(false)
  const lastSessionRef = useRef<string | null>(null)

  const close = useCallback(() => {
    closedRef.current = true
    setShowing(false)
    const video = videoRef.current
    if (video !== null) {
      try {
        video.pause()
      } catch {
        /* already stopped */
      }
    }
    if (document.fullscreenElement !== null && document.exitFullscreen !== undefined) {
      document.exitFullscreen().catch(() => {})
    }
  }, [])

  const open = useCallback(() => {
    closedRef.current = false
    setNeedsTap(false)
    setShowing(true)
  }, [])

  // Fire on every ENTRY into a conversation, not on every re-render.
  useEffect(() => {
    if (sessionId === null) return
    const entered = lastSessionRef.current !== sessionId
    lastSessionRef.current = sessionId
    if (!entered) return

    const pinned = readPinned()
    if (pinned !== null && pinned === sessionId) {
      // The designated conversation: every time it is opened.
      log('pinned session opened', sessionId)
      open()
      return
    }
    if (isNewConversation && !hasPlayed(sessionId)) {
      markPlayed(sessionId)
      log('new conversation', sessionId)
      open()
    }
  }, [sessionId, isNewConversation, open])

  // An explicit preview from the library. This exists because the normal trigger
  // is deliberately narrow — a NEW conversation plays once, and only a PINNED one
  // replays — so "I switched the clip and refreshed and the other one never
  // showed" was the expected behaviour of a design with no way to check your
  // choice. A preview button removes that guesswork.
  useEffect(() => {
    if (previewAt === 0) return
    log('preview requested', previewAt)
    open()
  }, [previewAt, open])

  // Start playback explicitly: relying on the autoplay attribute alone is
  // fragile, and a rejected play() has to surface as a tappable state.
  useEffect(() => {
    if (!showing) return undefined
    const video = videoRef.current
    if (video === null) return undefined
    video.muted = true
    const openedAt = performance.now()
    /** One line that carries everything a black-frame report needs. */
    const report = (label: string): void =>
      notify(label, {
        ms: Math.round(performance.now() - openedAt),
        readyState: video.readyState,
        networkState: video.networkState,
        src: video.currentSrc || video.src,
      })
    const onPlaying = (): void => {
      setPhase('playing')
      report('first frame painted')
    }
    video.addEventListener('playing', onPlaying)
    const attempt = video.play()
    if (attempt !== undefined && typeof attempt.then === 'function') {
      attempt.then(() => log('play started')).catch((error: unknown) => {
        log('play rejected', String(error))
        setNeedsTap(true)
      })
    }
    const guard = window.setTimeout(() => {
      if (!closedRef.current) {
        // Report BEFORE closing: a silent close leaves nothing to diagnose.
        setPhase('stalled')
        report('stalled, giving up after ' + STALL_TIMEOUT_MS + 'ms')
        close()
      }
    }, STALL_TIMEOUT_MS)
    return () => {
      video.removeEventListener('playing', onPlaying)
      window.clearTimeout(guard)
    }
  }, [showing, close])

  if (!showing) return null

  const activate = () => {
    const video = videoRef.current
    if (video === null) return
    if (needsTap) {
      setNeedsTap(false)
      video.muted = false
      const attempt = video.play()
      if (attempt !== undefined && typeof attempt.catch === 'function') attempt.catch(() => {})
    } else if (video.muted) {
      video.muted = false
    }
    if (document.fullscreenElement === null && typeof video.requestFullscreen === 'function') {
      video.requestFullscreen().catch(() => {})
    }
  }

  return h(
    'div',
    { className: 'dba-root', onClick: activate },
    h('video', {
      ref: videoRef,
      className: fit === 'cover' ? 'dba-video dba-cover' : 'dba-video',
      src,
      muted: true,
      autoPlay: true,
      playsInline: true,
      preload: 'auto',
      onEnded: close,
      onError: () => {
        const video = videoRef.current
        const code = video?.error?.code ?? 0
        const message = video?.error?.message ?? ''
        notify('video element error', { code, message, src: video?.currentSrc || src, readyState: video?.readyState ?? -1 })
        setPhase('error')
        // Do not slam the overlay shut: the reason has to stay readable for a
        // moment, and 跳过 is right there. The stall watchdog would have closed
        // it silently, which is how a real failure looks like "nothing happened".
        window.setTimeout(() => {
          if (!closedRef.current) close()
        }, 8000)
      },
      onClick: (event: { stopPropagation: () => void }) => event.stopPropagation(),
    }),
    phase === 'playing'
      ? null
      : h(
          'div',
          { className: 'dba-status' },
          phase === 'error'
            ? '视频加载失败 —— 控制台有 [dsh-boot-animation] 日志'
            : phase === 'stalled'
              ? '视频加载超时'
              : '正在加载视频…',
        ),
    h(
      'button',
      {
        type: 'button',
        className: 'dba-skip',
        onClick: (event: { stopPropagation: () => void }) => {
          event.stopPropagation()
          close()
        },
      },
      '跳过',
    ),
    h('div', { className: 'dba-hint' }, needsTap ? '点击播放' : '点击开启声音 · 全屏'),
  )
}

/** The pin toggle that lives beside Settings at the sidebar foot. */
function PinAction({ store, onOpen }: { store: CurrentStore | null; onOpen: () => void }): unknown {
  ensureStyle()
  const { sessionId } = useCurrentSession(store)
  const [pinned, setPinned] = useState<string | null>(() => readPinned())
  const isPinned = sessionId !== null && pinned === sessionId

  const toggle = () => {
    const next = isPinned ? null : sessionId
    writePinned(next)
    setPinned(next)
    log('pin toggled', { from: pinned, to: next })
  }

  const title = isPinned
    ? '这个会话已设为片头会话：每次打开都会播放片头动画（点击取消）'
    : '把这个会话设为片头会话：以后每次打开它都会播放片头动画'

  return h(
    'span',
    { className: 'dba-pin-wrap', style: { display: 'inline-flex', alignItems: 'center' } },
    h(
      'button',
      {
        type: 'button',
        className: isPinned ? 'dba-pin dba-pin-on' : 'dba-pin',
        title,
        'aria-label': title,
        disabled: sessionId === null,
        onClick: toggle,
      },
      isPinned ? '🎬' : '🎞',
    ),
    h(
      'button',
      {
        type: 'button',
        className: 'dba-pin dba-lib-open',
        title: '片头片库：查看、切换或添加片头视频',
        'aria-label': '打开片头片库',
        onClick: onOpen,
      },
      '🎛',
    ),
  )
}

/** One entry as the host lists it. */
type VideoInfo = {
  id: string
  name: string
  file: string
  ext?: string
  source: string
  writable?: boolean
  bytes: number
  mtime: string
  legacy?: boolean
  faststart?: boolean
  copies?: number
  alsoAt?: string[]
  /** Picked as the intro. */
  active?: boolean
  /** Picked as the workspace wallpaper. */
  wallpaper?: boolean
}

type VideoList = {
  /** The INTRO pick: the historical single-slot meaning of this field. */
  activeId: string | null
  activeHow?: string
  /** The intro clip's content key, for the media URL's `?v=`. */
  activeVersion?: string | null
  /** The WALLPAPER pick; it follows the intro until it is set on its own. */
  wallpaperId?: string | null
  wallpaperHow?: string
  wallpaperVersion?: string | null
  videos: VideoInfo[]
  userDir: string
}

/** The two things a clip can be picked for. */
type Role = 'intro' | 'wallpaper'
const ROLE_LABEL: Record<Role, string> = { intro: '入场动画', wallpaper: '工作区壁纸' }

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 B'
  if (n < 1024) return n + ' B'
  if (n < 1024 * 1024) return (n / 1024).toFixed(0) + ' KB'
  return (n / 1024 / 1024).toFixed(2) + ' MB'
}

/**
 * Where a clip comes from, as one word a user can act on.
 *
 * The plugin's clips are embedded in code now, so there is a single built-in
 * kind; anything else on the list is a file the user put there.
 */
const SOURCE_LABEL: Record<string, string> = {
  yours: '你自己加的',
  embedded: '插件内置',
  env: '环境变量',
}

/**
 * The video library: every .mp4 the host can see, the active one marked, and a
 * click to switch. Adding a video stays a filesystem action — the user drops a
 * file in and presses refresh — because a browser-side upload would have to
 * carry the bytes through this route for no gain on a local-only plugin.
 */
function VideoLibrary({ onClose, onPreview }: { onClose: () => void; onPreview: () => void }): ReactElement {
  ensureStyle()
  const [state, setState] = useState<VideoList | null>(null)
  const [fit, setFit] = useState<Fit>(() => readFit())
  const [msg, setMsg] = useState<{ text: string; kind: string }>({ text: '', kind: '' })
  const [busy, setBusy] = useState(false)
  // The skin lives in a module-level store, not in this component: it has to
  // survive the panel closing and be paintable from apply() on page load.
  const skin = useSkinState()

  const load = useCallback(async () => {
    try {
      const response = await fetch(LIST_URL, { cache: 'no-store' })
      const data = (await response.json()) as VideoList
      setState(data)
      setMsg({ text: '', kind: '' })
      // Keep the overlay's cached content key in step with the INTRO pick: a
      // `?v=` that no longer matches costs a revalidation on the next play (the
      // host answers `no-cache` for a stale key), and picking a clip is exactly
      // when that becomes stale.
      if (typeof data.activeVersion === 'string' && data.activeVersion !== '') {
        activeVersion = data.activeVersion
      }
    } catch (error: unknown) {
      setMsg({ text: '读取片库失败：' + String(error), kind: 'dba-err' })
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // Esc closes, like any other dialog in the shell.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const choose = useCallback(
    async (role: Role, id: string) => {
      setBusy(true)
      try {
        const response = await fetch(SELECT_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id, role }),
        })
        const data = (await response.json()) as { ok?: boolean; error?: string; name?: string }
        if (data.ok === true) {
          setMsg({
            text:
              '「' +
              ROLE_LABEL[role] +
              '」已设为：' +
              String(data.name ?? id) +
              (role === 'intro' ? '（下次播放片头生效）' : '（壁纸立刻更新）'),
            kind: 'dba-ok',
          })
          await load()
          // Only the WALLPAPER changes what the skin draws. Selecting an intro
          // must not touch the skin at all -- that separation is the point of
          // having two lists.
          if (role === 'wallpaper' && skinState.on) void syncSkin(false)
        } else {
          setMsg({ text: '切换失败：' + String(data.error ?? '未知错误'), kind: 'dba-err' })
        }
      } catch (error: unknown) {
        setMsg({ text: '切换失败：' + String(error), kind: 'dba-err' })
      } finally {
        setBusy(false)
      }
    },
    [load],
  )

  const videos = state === null ? [] : state.videos

  /**
   * One role's list. The rows are identical to the old single list -- same
   * badges, same size, same de-dup annotations -- only the tick and the click
   * target belong to one role now.
   */
  const renderRole = (role: Role, hint: string): unknown[] => [
    h(
      'div',
      { className: 'dba-sec-head' },
      h('span', { className: 'dba-sec-name' }, ROLE_LABEL[role]),
      h('span', { className: 'dba-sec-hint' }, hint),
    ),
    ...(videos.length === 0
      ? [h('div', { className: 'dba-item' }, h('span', { className: 'dba-nm' }, '（还没找到任何视频）'))]
      : videos.map((v) => {
          const isPicked = role === 'intro' ? v.active === true : v.wallpaper === true
          return h(
              'div',
              {
                key: v.id,
                className: 'dba-item' + (isPicked ? ' dba-cur' : ''),
                title: v.file,
                onClick: () => {
                  if (!busy && !isPicked) void choose(role, v.id)
                },
              },
              h('span', { className: 'dba-mark' }, isPicked ? '✓' : ''),
              h('span', { className: 'dba-nm' }, v.name),
              v.legacy ? h('span', { className: 'dba-badge' }, '原片源') : null,
              (v.copies ?? 1) > 1
                ? h(
                    'span',
                    {
                      className: 'dba-badge',
                      title:
                        '这一段在磁盘上有 ' +
                        String(v.copies) +
                        ' 份相同的副本，已合并成一条。你的文件没有被删，只是不重复列出。',
                    },
                    '合并 ' + String(v.copies) + ' 份重复',
                  )
                : null,
              // Only nudges on containers that can carry moov. A .webm has none,
              // so "not optimised" would be a lie about it.
              (v.ext === '.mp4' || v.ext === '.m4v') && v.faststart === false
                ? h(
                    'span',
                    {
                      className: 'dba-badge dba-b-warn',
                      title: '这个文件的索引表(moov)在末尾：浏览器要整段下载完才出画面，容易黑屏。用 ffmpeg -c copy -movflags +faststart 重排一次即可。',
                    },
                    '⚠ 未优化',
                  )
                : null,
              h('span', { className: 'dba-badge' }, SOURCE_LABEL[v.source] ?? v.source),
              h('span', { className: 'dba-meta' }, formatBytes(v.bytes)),
            )
        })),
  ]

  return h(
    'div',
    {
      className: 'dba-veil',
      onClick: (event: { target: unknown; currentTarget: unknown; stopPropagation: () => void }) => {
        if (event.target === event.currentTarget) onClose()
      },
    },
    h(
      'div',
      { className: 'dba-lib', onClick: (event: { stopPropagation: () => void }) => event.stopPropagation() },
      h('h3', null, '片头片库'),
      h('p', null, '两件东西各自选一段 —— 它们互不影响。'),
      ...renderRole('intro', '开新对话、以及打开你钉住的会话时播放'),
      ...renderRole('wallpaper', '铺在工作区画布后面的皮肤：静帧取尾帧，动态循环片尾'),
      h(
        'div',
        { className: 'dba-dir' },
        '想加自己的片子：把 mp4 放进这个文件夹，再点「刷新」',
        h('br', null),
        h('code', null, state === null ? '…' : state.userDir),
      ),
      h(
        'div',
        { className: 'dba-fit' },
        h('span', null, '播放时：'),
        h(
          'button',
          {
            type: 'button',
            className: 'dba-btn' + (fit === 'cover' ? ' dba-btn-on' : ''),
            title: '铺满整个窗口，超出部分裁掉 —— 不留黑边',
            onClick: () => {
              writeFit('cover')
              setFit('cover')
              setMsg({ text: '已设为「铺满屏幕」：下次播放生效', kind: 'dba-ok' })
            },
          },
          '铺满屏幕',
        ),
        h(
          'button',
          {
            type: 'button',
            className: 'dba-btn' + (fit === 'contain' ? ' dba-btn-on' : ''),
            title: '完整显示整帧，长宽比不匹配时留黑边',
            onClick: () => {
              writeFit('contain')
              setFit('contain')
              setMsg({ text: '已设为「完整显示」：下次播放生效', kind: 'dba-ok' })
            },
          },
          '完整显示',
        ),
      ),
      h(
        'div',
        { className: 'dba-fit' },
        h('span', null, '工作区皮肤：'),
        h(
          'button',
          {
            type: 'button',
            className: 'dba-btn' + (skin.on ? ' dba-btn-on' : ''),
            title: '把当前选中那段的尾帧铺成工作区背景。换一段片子，皮肤跟着换。',
            onClick: () => setSkinOn(!skin.on),
          },
          skin.on ? '已开启' : '用尾帧',
        ),
        ...LOOK_ORDER.map((look) =>
          h(
            'button',
            {
              key: look,
              type: 'button',
              className: 'dba-btn' + (skin.on && skin.look === look ? ' dba-btn-on' : ''),
              disabled: !skin.on,
              title: '模糊程度：清晰=原图，柔和=轻模糊，沉浸=重模糊。越模糊越不抢文字。',
              onClick: () => setSkinLook(look),
            },
            LOOK_LABEL[look],
          ),
        ),
      ),
      h(
        'div',
        { className: 'dba-fit' },
        h('span', null, '透明度：'),
        h('input', {
          type: 'range',
          min: 0,
          max: 100,
          step: 5,
          className: 'dba-range',
          value: String(skin.strength),
          disabled: !skin.on,
          title: '0 = 皮肤最清楚（文字也最直接压在图上），100 = 完全透明（等于没有皮肤）。侧边栏跟着一起变。',
          onChange: (event: { target: { value: string } }) => setSkinStrength(Number(event.target.value)),
        }),
        h('span', { className: 'dba-num' }, String(skin.strength) + '%'),
      ),
      h(
        'div',
        { className: 'dba-fit' },
        h('span', null, '皮肤画面：'),
        h(
          'button',
          {
            type: 'button',
            className: 'dba-btn' + (skin.on && skin.motion === 'still' ? ' dba-btn-on' : ''),
            disabled: !skin.on,
            title: '尾帧定格当背景：零开销，刷新后立刻就在',
            onClick: () => setSkinMotion('still'),
          },
          '静帧',
        ),
        h(
          'button',
          {
            type: 'button',
            className: 'dba-btn' + (skin.on && skin.motion === 'live' ? ' dba-btn-on' : ''),
            disabled: !skin.on,
            title: '循环播放选中那段片子当背景：会一直在解码并做模糊，比较费电。视频加载好之前显示的仍是尾帧。',
            onClick: () => setSkinMotion('live'),
          },
          '动态',
        ),
      ),
      h(
        'div',
        { className: 'dba-fit' },
        h('span', null, '动态时长：'),
        ...SPAN_OPTIONS.map((seconds) =>
          h(
            'button',
            {
              key: String(seconds),
              type: 'button',
              // Highlighted even while 静帧 disables the row: the choice is
              // stored and it is what 动态 will use, so hiding it would leave
              // the user guessing what they are about to switch into.
              className: 'dba-btn' + (skin.on && skin.span === seconds ? ' dba-btn-on' : ''),
              disabled: !skin.on || skin.motion !== 'live',
              title:
                seconds === 0
                  ? '整段循环：从头播放整支片头'
                  : '只循环这段片子的最后 ' + String(seconds) + ' 秒 —— 片尾通常是定格的标题卡，循环起来更安静',
              onClick: () => setSkinSpan(seconds),
            },
            spanLabel(seconds),
          ),
        ),
      ),
      h(
        'div',
        { className: 'dba-fit' },
        h('span', null, '皮肤范围：'),
        h(
          'button',
          {
            type: 'button',
            className: 'dba-btn' + (skin.on && skin.scope === 'window' ? ' dba-btn-on' : ''),
            disabled: !skin.on,
            title: '整张铺满窗口，侧边栏变成半透明玻璃',
            onClick: () => setSkinScope('window'),
          },
          '整个窗口',
        ),
        h(
          'button',
          {
            type: 'button',
            className: 'dba-btn' + (skin.on && skin.scope === 'conversation' ? ' dba-btn-on' : ''),
            disabled: !skin.on,
            title: '只有中间的对话区露出皮肤，侧边栏保持原来的实底',
            onClick: () => setSkinScope('conversation'),
          },
          '仅对话区',
        ),
      ),
      h(
        'div',
        { className: 'dba-fit' },
        h('span', null, '侧边栏透明度：'),
        h('input', {
          type: 'range',
          min: 0,
          max: 100,
          step: 5,
          className: 'dba-range',
          value: String(skin.sidebar),
          disabled: !skin.on || skin.scope !== 'window',
          title:
            '单独调侧边栏：0 = 保持它自己的实底（完全挡住皮肤），100 = 完全透出皮肤。' +
            '和上面皮肤那根滑块互相独立。范围选「仅对话区」时这一项不生效。',
          onChange: (event: { target: { value: string } }) => setSkinSidebar(Number(event.target.value)),
        }),
        h('span', { className: 'dba-num' }, String(skin.sidebar) + '%'),
      ),
      h(
        'div',
        { className: 'dba-msg ' + (skin.status === 'error' ? 'dba-err' : skin.status === 'ready' ? 'dba-ok' : '') },
        skin.detail,
      ),
      h(
        'div',
        { className: 'dba-bar' },
        h(
          'button',
          {
            type: 'button',
            className: 'dba-btn dba-btn-preview',
            title: '立刻播放当前选中的入场动画，不用等下一次开新对话或钉住的会话',
            onClick: onPreview,
          },
          '▶ 预览入场动画',
        ),
        h(
          'button',
          { type: 'button', className: 'dba-btn', onClick: () => void load() },
          '刷新',
        ),
        h('button', { type: 'button', className: 'dba-btn', onClick: onClose }, '关闭'),
      ),
      h('div', { className: 'dba-msg ' + msg.kind }, msg.text),
    ),
  )
}

// #region workspace skin
//
// The skin is the SELECTED clip's last usable frame, kept as a still behind the
// whole shell. It follows the library selection: pick another clip and the
// backdrop follows, including a clip the user dropped in themselves.
//
// Why a still and not a live video element: a skin is a still. One decode plus
// a several-hundred-KB localStorage entry buys an instant backdrop on every
// later load, no media pipeline running behind the UI, and survival of the clip
// file being moved or deleted afterwards. 动态 mode is the opt-in exception —
// it loops the clip itself inside the same layer (see .dba-skin-live), which
// costs a permanent decode + blur, hence not being the default.
//
// Why the tail and not a fixed timestamp: these clips are intros, and an intro's
// LAST frame is routinely a fade to black — a black skin is a bug report. So the
// tail is sampled backwards from the end until a frame carries actual picture
// (luma and spread thresholds below), which is also the honest reading of "the
// last few frames".

const SKIN_ON_KEY = 'dsh-boot-animation:skin'
const SKIN_LOOK_KEY = 'dsh-boot-animation:skin-look'
const SKIN_SCOPE_KEY = 'dsh-boot-animation:skin-scope'
const SKIN_STRENGTH_KEY = 'dsh-boot-animation:skin-strength'
const SKIN_SIDEBAR_KEY = 'dsh-boot-animation:skin-sidebar'
const SKIN_MOTION_KEY = 'dsh-boot-animation:skin-motion'
const SKIN_SPAN_KEY = 'dsh-boot-animation:skin-span'
/** Transparency percent: 0 shows the frame at full strength, 100 shows none of it. */
const SKIN_STRENGTH_DEFAULT = 30
/**
 * The sidebar's OWN transparency percent: 0 keeps its solid fill, 100 lets the
 * skin through completely. Deliberately separate from the skin's strength --
 * the two are different questions ("how visible is the picture" vs "how much of
 * the sidebar's surface do I give up for it"), and coupling them made
 * "clear skin + solid sidebar" unexpressible.
 */
const SKIN_SIDEBAR_DEFAULT = 35
/**
 * How much of the clip's END the live mode loops, in seconds; 0 means the whole
 * clip. These intros settle into a title card for their last seconds, so looping
 * only the tail is a calmer backdrop than replaying the whole animation -- and
 * it is what "the last 3 seconds" asks for.
 */
const SKIN_SPAN_DEFAULT = 3
const SPAN_OPTIONS: number[] = [0, 5, 3, 1]
const spanLabel = (seconds: number): string => (seconds === 0 ? '全程' : String(seconds) + ' 秒')
/** The one stored frame. Only the ACTIVE clip is ever skinned, so one entry is enough. */
const SKIN_FRAME_KEY = 'dsh-boot-animation:skin-frame'
const SKIN_LAYER_ID = 'dsh-boot-animation-skin'
const MEDIA_URL = '/dsh-boot-animation/media/'
/** Seconds back from the end, tried in order until a frame carries a picture. */
const TAIL_BACKOFF_S = [0.06, 0.3, 0.6, 1.0, 1.5, 2.2]
/** Cap the raster's long edge: a 4K clip would otherwise blow the storage quota. */
const FRAME_MAX_EDGE = 1920
const FRAME_QUALITY = 0.82
const SKIN_TIMEOUT_MS = 20000
/** A frame below this mean luma (0..1) counts as black; below this spread, as flat. */
const MIN_LUMA = 0.05
const MIN_SPREAD = 0.012

type Look = 'crisp' | 'soft' | 'deep'
type Scope = 'window' | 'conversation'
/** Still tail frame, or the clip itself looped behind the UI. */
type Motion = 'still' | 'live'
/** The tail of the clip the live mode loops, in seconds (0 = the whole clip). */
type Span = number
const LOOK_ORDER: Look[] = ['crisp', 'soft', 'deep']
const LOOK_LABEL: Record<Look, string> = { crisp: '清晰', soft: '柔和', deep: '沉浸' }

/**
 * How bright the frame arrives, per palette.
 *
 * History, because this value keeps being the subject of feedback:
 *   - first it was brightness 0.5 + a 30% black veil, i.e. ~34% of the frame's
 *     own luminance, reported as "0% is still too dark, I cannot see it";
 *   - then the veil was thinned to ~80% transmission;
 *   - then 动态 turned out to be missing the veil entirely (the video is a child
 *     of the shot and painted over it), and the preference was the veil-FREE
 *     look -- "make the still the same as the live one" -- so the veil is gone.
 * Readability is now entirely the transparency slider's job: it dilutes the
 * frame toward the palette's base colour, which is the same kind of wash but
 * under the user's control instead of baked in.
 *
 * The light palette still brightens rather than darkens: it puts a dark frame
 * behind dark text otherwise.
 */
const BRIGHTNESS: { dark: number; light: number } = { dark: 0.92, light: 1.2 }

const LOOKS: Record<Look, { blur: number }> = {
  crisp: { blur: 0 },
  soft: { blur: 18 },
  deep: { blur: 48 },
}

type SkinState = {
  /** The user's switch, not whether a frame is painted yet. */
  on: boolean
  look: Look
  scope: Scope
  /** Transparency percent, 0..100. */
  strength: number
  /** The sidebar's own transparency percent, 0..100. */
  sidebar: number
  /** Still tail frame or the looping clip. */
  motion: Motion
  /** Seconds of the clip's tail the live mode loops (0 = whole clip). */
  span: Span
  status: 'idle' | 'working' | 'ready' | 'error'
  detail: string
  /** The name of the clip the painted frame came from. */
  source: string
  /** `<id>@<version>` of the painted frame; what a later sync compares against. */
  key: string
}

function readFlag(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeFlag(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    /* private mode: the choice simply does not persist */
  }
}

function readLook(): Look {
  const value = readFlag(SKIN_LOOK_KEY)
  return value === 'crisp' || value === 'deep' ? value : 'soft'
}

function readScope(): Scope {
  return readFlag(SKIN_SCOPE_KEY) === 'conversation' ? 'conversation' : 'window'
}

/**
 * Transparency percent, clamped to the control's own range.
 *
 * The stored value is read as a STRING first: `Number(null)` is 0, not NaN, so
 * feeding an absent key straight into Number() silently turns every default
 * into 0 -- which is how "透明度 defaults to 30%" became "defaults to 0%".
 */
function readPercent(key: string, fallback: number): number {
  const stored = readFlag(key)
  if (stored === null || stored.trim() === '') return fallback
  const raw = Number(stored)
  if (!Number.isFinite(raw)) return fallback
  return Math.min(100, Math.max(0, Math.round(raw)))
}

function readStrength(): number {
  return readPercent(SKIN_STRENGTH_KEY, SKIN_STRENGTH_DEFAULT)
}

function readSidebar(): number {
  return readPercent(SKIN_SIDEBAR_KEY, SKIN_SIDEBAR_DEFAULT)
}

/** Still by default: live costs a permanent decode plus a blur every frame. */
function readMotion(): Motion {
  return readFlag(SKIN_MOTION_KEY) === 'live' ? 'live' : 'still'
}

function readSpan(): Span {
  const stored = readFlag(SKIN_SPAN_KEY)
  if (stored === null || stored.trim() === '') return SKIN_SPAN_DEFAULT
  const raw = Number(stored)
  if (!Number.isFinite(raw) || raw < 0) return SKIN_SPAN_DEFAULT
  return Math.round(raw)
}

type StoredFrame = { id?: unknown; version?: unknown; name?: unknown; back?: unknown; dataUrl?: unknown }
type StoredFrameRead = { image: string; key: string; source: string; back: number; url: string }

const EMPTY_FRAME: StoredFrameRead = { image: '', key: '', source: '', back: 0, url: '' }

/**
 * Read the stored frame synchronously, before any fetch.
 *
 * This is what makes the skin appear on the first paint instead of after a
 * round trip; the async sync then only has to notice that the host's selection
 * moved on. The clip URL comes back too, so 动态 mode can start looping the
 * same clip on that first paint rather than waiting for the fetch.
 */
function readStoredFrame(): StoredFrameRead {
  try {
    const raw = window.localStorage.getItem(SKIN_FRAME_KEY)
    if (raw === null) return EMPTY_FRAME
    const parsed = JSON.parse(raw) as StoredFrame
    const dataUrl = parsed.dataUrl
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) return EMPTY_FRAME
    const id = typeof parsed.id === 'string' ? parsed.id : ''
    const version = typeof parsed.version === 'string' ? parsed.version : ''
    return {
      image: dataUrl,
      key: id === '' ? '' : skinKeyOf(id, version),
      source: typeof parsed.name === 'string' ? parsed.name : id,
      back: typeof parsed.back === 'number' && Number.isFinite(parsed.back) ? parsed.back : 0,
      url: id === '' ? '' : mediaUrlOf(id, version),
    }
  } catch {
    return EMPTY_FRAME
  }
}

function writeStoredFrame(
  id: string,
  version: string | null,
  name: string,
  back: number,
  dataUrl: string,
): void {
  try {
    window.localStorage.setItem(SKIN_FRAME_KEY, JSON.stringify({ id, version, name, back, dataUrl }))
  } catch {
    /* quota: the skin still paints for this session */
  }
}

/**
 * The media URL a stored frame came from, rebuilt from its id and content key.
 *
 * The live layer needs the URL on the FIRST paint, before any fetch, so it can
 * start looping the same clip the stored poster shows; deriving it here keeps
 * that path synchronous like the poster itself.
 */
function mediaUrlOf(id: string, version: string): string {
  return MEDIA_URL + encodeURIComponent(id) + (version === '' ? '' : '?v=' + encodeURIComponent(version))
}

/** The frame bytes currently painted. */
let skinImage = ''
/** How far before the end the painted frame was taken, for the panel's wording. */
let skinBack = 0
/** The clip URL the painted frame (and 动态 mode) belongs to. */
let skinUrl = ''
const storedStart = readStoredFrame()
skinImage = storedStart.image
skinBack = storedStart.back
skinUrl = storedStart.url

let skinState: SkinState = {
  on: readFlag(SKIN_ON_KEY) === '1',
  look: readLook(),
  scope: readScope(),
  strength: readStrength(),
  sidebar: readSidebar(),
  motion: readMotion(),
  span: readSpan(),
  status: 'idle',
  detail: '',
  source: storedStart.source,
  key: storedStart.key,
}

const skinListeners = new Set<() => void>()

function setSkinState(patch: Partial<SkinState>): void {
  skinState = { ...skinState, ...patch }
  for (const listener of skinListeners) {
    try {
      listener()
    } catch {
      /* a stale subscriber must not break the skin */
    }
  }
}

function subscribeSkin(listener: () => void): () => void {
  skinListeners.add(listener)
  return () => {
    skinListeners.delete(listener)
  }
}

function useSkinState(): SkinState {
  return useSyncExternalStore(subscribeSkin, () => skinState)
}

function skinLayer(): HTMLDivElement | null {
  const found = document.getElementById(SKIN_LAYER_ID)
  return found instanceof HTMLDivElement ? found : null
}

function ensureSkinLayer(): HTMLDivElement | null {
  if (document.body === null) return null
  const found = skinLayer()
  if (found !== null) return found
  const layer = document.createElement('div')
  layer.id = SKIN_LAYER_ID
  layer.className = 'dba-skin'
  layer.setAttribute('aria-hidden', 'true')
  // The frame is a child, not a background on the layer itself: the layer has
  // to keep painting the palette's base colour underneath it, or lowering the
  // frame's opacity would fade through to the browser's own canvas.
  const shot = document.createElement('div')
  shot.className = 'dba-skin-shot'
  layer.appendChild(shot)
  document.body.appendChild(layer)
  return layer
}

function skinShot(): HTMLDivElement | null {
  const layer = skinLayer()
  const shot = layer === null ? null : layer.firstElementChild
  return shot instanceof HTMLDivElement ? shot : null
}

/**
 * The looping clip, created lazily: 静帧 never pays for a video element at all.
 *
 * It lives INSIDE the shot, so the shot's filter, opacity and scale apply to it
 * with no extra CSS, and the shot's background-image keeps showing the tail
 * frame until the video has painted.
 */
function ensureSkinVideo(): HTMLVideoElement | null {
  const shot = skinShot()
  if (shot === null) return null
  const found = shot.firstElementChild
  if (found instanceof HTMLVideoElement) return found
  const video = document.createElement('video')
  video.className = 'dba-skin-live'
  video.muted = true
  video.loop = true
  video.playsInline = true
  video.preload = 'auto'
  video.setAttribute('playsinline', '')
  video.setAttribute('muted', '')
  video.setAttribute('aria-hidden', 'true')
  // Attached ONCE, at creation: paintSkin runs on every state change, so
  // registering these per paint would stack duplicate listeners.
  //   loadedmetadata -- the tail window is only known once duration is, and this
  //                     is what pulls playback off the clip's first frame.
  //   timeupdate     -- the fallback wrap check for engines without
  //                     requestVideoFrameCallback.
  //   playing        -- (re)arm the per-frame watcher.
  video.addEventListener('loadedmetadata', () => {
    syncLoopMode(video)
    clampToWindow(video)
  })
  video.addEventListener('timeupdate', () => clampToWindow(video))
  video.addEventListener('playing', () => startSpanWatcher(video))
  // Reached only if the wrap lost the race (no requestVideoFrameCallback, or a
  // slow frame): restart the window by hand instead of staying frozen.
  video.addEventListener('ended', () => {
    clampToWindow(video)
    const attempt = video.play()
    if (attempt !== undefined && typeof attempt.catch === 'function') attempt.catch(() => {})
  })
  shot.appendChild(video)
  return video
}

function skinVideo(): HTMLVideoElement | null {
  const shot = skinShot()
  const found = shot === null ? null : shot.firstElementChild
  return found instanceof HTMLVideoElement ? found : null
}

/**
 * The window of the clip the live mode is allowed to play, in seconds.
 *
 * `start` is where a wrap seeks back to; 0 when the whole clip is allowed (an
 * unknown duration, or a clip shorter than the requested tail, both mean "the
 * whole thing").
 */
function liveWindow(video: HTMLVideoElement): { start: number; end: number } {
  const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0
  const span = skinState.span
  if (duration === 0) return { start: 0, end: 0 }
  if (span > 0 && duration > span + 0.2) return { start: duration - span, end: duration }
  return { start: 0, end: duration }
}

/** Put playback inside the window, from whichever side it escaped. */
function clampToWindow(video: HTMLVideoElement): void {
  const { start, end } = liveWindow(video)
  if (end === 0) return
  const now = video.currentTime
  // The wrap margin is deliberately wide enough to win the race against the
  // media element's own end handling: at 30fps a frame is ~33ms, so clamping at
  // end-0.05 stops on the last frame instead of letting the clip run off the end.
  if (now < start - 0.08 || now > end - 0.05) {
    try {
      video.currentTime = start
    } catch {
      /* a seek before metadata is a no-op the guard retries */
    }
  }
}

/**
 * Native looping only when the window IS the whole clip.
 *
 * With a tail window selected, the element's own `loop` is a liability: it
 * rewinds to the clip's HEAD, so whichever of the two fires first decides
 * whether the user sees the intro's opening frame again. Hand-wrapping cannot
 * show anything outside the window, and `ended` is caught below so the fallback
 * is a stutter, never a frozen backdrop.
 */
function syncLoopMode(video: HTMLVideoElement): void {
  video.loop = liveWindow(video).start === 0
}

/**
 * Keep the player inside the tail window.
 *
 * The element keeps `loop`, so a missed wrap degrades into the clip restarting
 * rather than freezing; this guard then seeks forward into the window on the
 * next tick. requestVideoFrameCallback gives per-frame precision where it
 * exists; the timeupdate listener covers engines without it (and pauses).
 */
let spanWatcher: { video: HTMLVideoElement; id: number | null } | null = null

function stopSpanWatcher(): void {
  if (spanWatcher === null) return
  const { video, id } = spanWatcher
  spanWatcher = null
  if (id === null) return
  const withCallback = video as HTMLVideoElement & { cancelVideoFrameCallback?: (handle: number) => void }
  if (typeof withCallback.cancelVideoFrameCallback === 'function') {
    try {
      withCallback.cancelVideoFrameCallback(id)
    } catch {
      /* already gone */
    }
  }
}

function startSpanWatcher(video: HTMLVideoElement): void {
  stopSpanWatcher()
  const withCallback = video as HTMLVideoElement & {
    requestVideoFrameCallback?: (callback: () => void) => number
  }
  const entry: { video: HTMLVideoElement; id: number | null } = { video, id: null }
  spanWatcher = entry
  if (typeof withCallback.requestVideoFrameCallback !== 'function') return
  const tick = (): void => {
    if (spanWatcher !== entry) return
    clampToWindow(video)
    entry.id = withCallback.requestVideoFrameCallback?.(tick) ?? null
  }
  entry.id = withCallback.requestVideoFrameCallback(tick)
}

/**
 * Start, retarget or stop the live layer.
 *
 * `data-src` is the clip's content-keyed URL, so a library switch loads the new
 * clip and the browser's immutable cache makes a switch back free.
 */
function syncSkinVideo(active: boolean): void {
  if (!active || skinState.motion !== 'live' || skinUrl === '') {
    stopSpanWatcher()
    const video = skinVideo()
    if (video === null) return
    if (!video.paused) {
      try {
        video.pause()
      } catch {
        /* already stopped */
      }
    }
    // Release the decoder: a paused element that keeps its src keeps its
    // buffered ranges, and 动态 is the one mode that can hold a lot of them.
    if (video.dataset.src !== '') {
      video.dataset.src = ''
      video.removeAttribute('src')
      try {
        video.load()
      } catch {
        /* nothing to release */
      }
    }
    return
  }
  const video = ensureSkinVideo()
  if (video === null) return
  if (video.dataset.src !== skinUrl) {
    video.dataset.src = skinUrl
    video.src = skinUrl
    try {
      video.load()
    } catch {
      /* the error event would follow */
    }
  }
  // Inside the tail window is the only place playback belongs; the listeners
  // installed at creation enforce that, and this call covers the case where the
  // metadata (and therefore the window) is already known.
  syncLoopMode(video)
  clampToWindow(video)
  if (video.paused) {
    // Muted + playsinline is the one combination browsers autoplay; a rejection
    // is not worth surfacing, because the poster (the still tail frame) is what
    // remains on screen and it is already correct.
    const attempt = video.play()
    if (attempt !== undefined && typeof attempt.then === 'function') {
      attempt.then(() => startSpanWatcher(video)).catch(() => {})
    } else {
      startSpanWatcher(video)
    }
  } else {
    startSpanWatcher(video)
  }
}

/**
 * Publish the current state to the DOM — the only function that touches it.
 *
 * Idempotent on purpose: it is called from a store mutation, from a scheme
 * change, and from apply(), and re-running it must never stack layers.
 */
function paintSkin(): void {
  if (document.body === null) return
  const root = document.documentElement
  const active = skinState.on && skinImage !== ''
  root.classList.toggle('dba-skin-on', active)
  root.classList.toggle('dba-skin-window', active && skinState.scope === 'window')
  root.classList.toggle('dba-skin-live-on', active && skinState.motion === 'live')
  // Unitless 0..1: read by the frame's opacity. The sidebar reads its own
  // variable below, so the two sliders stay independent.
  root.style.setProperty('--dba-skin-strength', String((100 - skinState.strength) / 100))
  // The sidebar fill's alpha: its own control, and only meaningful in window
  // scope (the CSS only consumes it under .dba-skin-window anyway).
  root.style.setProperty('--dba-skin-sidebar', String(100 - skinState.sidebar) + '%')
  if (!active || ensureSkinLayer() === null) {
    syncSkinVideo(false)
    return
  }
  const shot = skinShot()
  if (shot === null) {
    syncSkinVideo(false)
    return
  }
  const look = LOOKS[skinState.look]
  const bright = document.body.hasAttribute('data-ds-dark-theme') ? BRIGHTNESS.dark : BRIGHTNESS.light
  // ONE filter on ONE element covers the still frame (its background) and the
  // live video (its child), so 静帧 and 动态 cannot drift apart: they differ only
  // in whether the picture moves.
  shot.style.backgroundImage = 'url("' + skinImage + '")'
  shot.style.filter = 'blur(' + String(look.blur) + 'px) brightness(' + String(bright) + ')'
  syncSkinVideo(true)
}

function once(video: HTMLVideoElement, event: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup()
      reject(new Error('等待 ' + event + ' 超时'))
    }, timeoutMs)
    function cleanup(): void {
      window.clearTimeout(timer)
      video.removeEventListener(event, ok)
      video.removeEventListener('error', bad)
    }
    function ok(): void {
      cleanup()
      resolve()
    }
    function bad(): void {
      cleanup()
      reject(new Error('视频解码失败'))
    }
    video.addEventListener(event, ok)
    video.addEventListener('error', bad)
  })
}

async function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  // Assigning the time it is already at fires no `seeked`, so that case has to
  // resolve on its own or the caller waits for the timeout.
  if (Math.abs(video.currentTime - time) < 0.004 && video.readyState >= 2) return
  await new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup()
      reject(new Error('跳转超时'))
    }, SKIN_TIMEOUT_MS)
    function cleanup(): void {
      window.clearTimeout(timer)
      video.removeEventListener('seeked', ok)
    }
    function ok(): void {
      cleanup()
      resolve()
    }
    video.addEventListener('seeked', ok)
    try {
      video.currentTime = time
    } catch (error: unknown) {
      cleanup()
      reject(error instanceof Error ? error : new Error(String(error)))
    }
  })
}

/** One decoded frame past the seek, on engines that can tell us about it. */
async function settleFrame(video: HTMLVideoElement): Promise<void> {
  const withCallback = video as HTMLVideoElement & {
    requestVideoFrameCallback?: (callback: () => void) => number
  }
  if (typeof withCallback.requestVideoFrameCallback !== 'function') return
  await new Promise<void>((resolve) => {
    const timer = window.setTimeout(resolve, 400)
    withCallback.requestVideoFrameCallback?.(() => {
      window.clearTimeout(timer)
      resolve()
    })
  })
}

/** Mean luma and spread of a frame, sampled small — enough to spot black or flat. */
function frameStats(source: HTMLCanvasElement): { luma: number; spread: number } {
  const probe = document.createElement('canvas')
  probe.width = 32
  probe.height = 18
  const context = probe.getContext('2d')
  if (context === null) return { luma: 1, spread: 1 }
  context.drawImage(source, 0, 0, probe.width, probe.height)
  const data = context.getImageData(0, 0, probe.width, probe.height).data
  const lumas: number[] = []
  let sum = 0
  for (let i = 0; i < data.length; i += 4) {
    const luma = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255
    lumas.push(luma)
    sum += luma
  }
  const mean = sum / Math.max(1, lumas.length)
  let variance = 0
  for (const luma of lumas) variance += (luma - mean) * (luma - mean)
  return { luma: mean, spread: Math.sqrt(variance / Math.max(1, lumas.length)) }
}

/**
 * Rasterize the clip's last usable frame to a JPEG data URL.
 *
 * The element is never attached: nothing here is meant to be seen, and an
 * off-document video still decodes and still honours seeks.
 */
async function captureTailFrame(url: string): Promise<{ dataUrl: string; back: number }> {
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.preload = 'auto'
  video.src = url
  try {
    await once(video, 'loadedmetadata', SKIN_TIMEOUT_MS)
    if (video.readyState < 2) await once(video, 'loadeddata', SKIN_TIMEOUT_MS)
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0
    const width = video.videoWidth > 0 ? video.videoWidth : 1280
    const height = video.videoHeight > 0 ? video.videoHeight : 720
    const scale = Math.min(1, FRAME_MAX_EDGE / Math.max(width, height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(2, Math.round(width * scale))
    canvas.height = Math.max(2, Math.round(height * scale))
    const context = canvas.getContext('2d')
    if (context === null) throw new Error('无法创建画布')
    // An unknown duration still has an end: a huge time is clamped to it by
    // every engine, which is the only way to ask for "the last frame".
    const offsets = duration === 0 ? [0] : TAIL_BACKOFF_S
    let fallback = ''
    let chosen = 0
    for (const back of offsets) {
      await seekTo(video, duration === 0 ? 1e6 : Math.max(0, duration - back))
      await settleFrame(video)
      context.drawImage(video, 0, 0, canvas.width, canvas.height)
      fallback = canvas.toDataURL('image/jpeg', FRAME_QUALITY)
      chosen = back
      const stats = frameStats(canvas)
      if (stats.luma >= MIN_LUMA && stats.spread >= MIN_SPREAD) {
        log('tail frame accepted', { back, ...stats })
        return { dataUrl: fallback, back }
      }
      log('tail frame rejected', { back, ...stats })
    }
    // Every candidate was black or flat. Produce SOMETHING rather than nothing:
    // a dim skin the user can turn off beats an error they cannot act on.
    return { dataUrl: fallback, back: chosen }
  } finally {
    video.removeAttribute('src')
    try {
      video.load()
    } catch {
      /* the element was never attached; nothing to release */
    }
  }
}

function skinKeyOf(id: string, version: string | null | undefined): string {
  return id + '@' + (typeof version === 'string' ? version : '')
}

function frameDetail(name: string, back: number): string {
  return back > 0
    ? '皮肤取自「' + name + '」的尾帧（末尾前 ' + back.toFixed(2) + ' 秒）'
    : '皮肤取自「' + name + '」的最后一帧'
}

/**
 * Reconcile the painted skin with the host's WALLPAPER selection.
 *
 * It is deliberately not `activeId`: that field means the intro, and the whole
 * point of the two lists is that picking an intro leaves the wallpaper alone.
 * `?? activeId` only covers a host that predates the split.
 *
 * `force` re-reads the media even when the stored frame already matches, which is
 * what a wallpaper switch needs after its content key changes.
 */
async function syncSkin(force: boolean): Promise<void> {
  if (!skinState.on) {
    paintSkin()
    return
  }
  let list: VideoList
  try {
    const response = await fetch(LIST_URL, { cache: 'no-store' })
    list = (await response.json()) as VideoList
  } catch (error: unknown) {
    setSkinState({ status: 'error', detail: '皮肤：读片库失败（' + String(error) + '）' })
    return
  }
  const raw = list.wallpaperId ?? list.activeId
  const rawVersion = list.wallpaperVersion ?? list.activeVersion ?? null
  const version = typeof rawVersion === 'string' && rawVersion !== '' ? rawVersion : null
  const id = typeof raw === 'string' && raw !== '' ? raw : null
  if (id === null) {
    setSkinState({ status: 'error', detail: '皮肤：当前没有选中的壁纸' })
    return
  }
  const active = list.videos.find((video) => video.id === id)
  const name = active?.name ?? id
  const key = skinKeyOf(id, version)
  if (!force && key === skinState.key && skinImage !== '') {
    setSkinState({ status: 'ready', detail: frameDetail(skinState.source === '' ? name : skinState.source, skinBack) })
    paintSkin()
    return
  }
  setSkinState({ status: 'working', detail: '皮肤：正在从「' + name + '」的尾帧生成…', source: name })
  try {
    const url = MEDIA_URL + encodeURIComponent(id) + (version === null ? '' : '?v=' + encodeURIComponent(version))
    const shot = await captureTailFrame(url)
    skinImage = shot.dataUrl
    skinBack = shot.back
    skinUrl = url
    writeStoredFrame(id, version, name, shot.back, shot.dataUrl)
    setSkinState({ status: 'ready', detail: frameDetail(name, shot.back), source: name, key })
    paintSkin()
  } catch (error: unknown) {
    setSkinState({ status: 'error', detail: '皮肤：生成失败（' + String(error) + '）' })
  }
}

function setSkinOn(on: boolean): void {
  writeFlag(SKIN_ON_KEY, on ? '1' : '0')
  setSkinState({ on })
  if (!on) {
    setSkinState({ status: 'idle', detail: '皮肤已关闭' })
    paintSkin()
    return
  }
  paintSkin()
  void syncSkin(false)
}

function setSkinMotion(motion: Motion): void {
  writeFlag(SKIN_MOTION_KEY, motion)
  setSkinState({
    motion,
    detail: skinState.on
      ? motion === 'live'
        ? '皮肤画面：动态 —— 循环播放选中那段的' + (skinState.span === 0 ? '全程' : '最后 ' + String(skinState.span) + ' 秒')
        : '皮肤画面：静帧 —— 尾帧定格，不额外开销'
      : skinState.detail,
  })
  paintSkin()
}

function setSkinSpan(seconds: Span): void {
  writeFlag(SKIN_SPAN_KEY, String(seconds))
  setSkinState({
    span: seconds,
    detail: skinState.on
      ? '动态时长：' + (seconds === 0 ? '整段循环' : '只循环最后 ' + String(seconds) + ' 秒')
      : skinState.detail,
  })
  paintSkin()
}

function setSkinLook(look: Look): void {
  writeFlag(SKIN_LOOK_KEY, look)
  setSkinState({ look, detail: skinState.on ? '皮肤观感：' + LOOK_LABEL[look] : skinState.detail })
  paintSkin()
}

function setSkinScope(scope: Scope): void {
  writeFlag(SKIN_SCOPE_KEY, scope)
  setSkinState({ scope })
  paintSkin()
}

function setSkinStrength(percent: number): void {
  const strength = Math.min(100, Math.max(0, Math.round(percent)))
  writeFlag(SKIN_STRENGTH_KEY, String(strength))
  setSkinState({ strength })
  paintSkin()
}

function setSkinSidebar(percent: number): void {
  const sidebar = Math.min(100, Math.max(0, Math.round(percent)))
  writeFlag(SKIN_SIDEBAR_KEY, String(sidebar))
  setSkinState({
    sidebar,
    detail: skinState.on
      ? sidebar === 0
        ? '侧边栏透明度：0% —— 保持它自己的实底，完全挡住皮肤'
        : sidebar === 100
          ? '侧边栏透明度：100% —— 完全透出皮肤，文字会直接压在图上'
          : '侧边栏透明度：' + String(sidebar) + '%'
      : skinState.detail,
  })
  paintSkin()
}

/**
 * Repaint when the theme flips. `body[data-ds-dark-theme]` is the theme's own
 * switch, and the look's brightness has to invert with it.
 */
function watchScheme(): void {
  if (document.body === null || typeof MutationObserver !== 'function') return
  const observer = new MutationObserver(() => paintSkin())
  observer.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })
}
// #endregion workspace skin

type ClientContext = {
  slots: {
    inject: (name: string, register: () => unknown) => unknown
    register: (options: Record<string, unknown>, component: unknown) => unknown
  }
  uiSession?: { adapter?: { current?: CurrentStore } }
  effect?: (callback: () => unknown, label?: string) => unknown
}

/**
 * Opens the library from outside the overlay's own React tree.
 *
 * The pin sits in a different slot than the overlay, so it cannot share React
 * state with the component that renders the dialog: they are two separate roots
 * that this plugin happens to register. A module-level listener pair is the
 * smallest honest bridge between them.
 */
const libraryOpeners = new Set<() => void>()
function openLibrary(): void {
  for (const open of libraryOpeners) {
    try {
      open()
    } catch {
      /* a stale subscriber must not break the pin */
    }
  }
}

export function apply(ctx: ClientContext): void {
  const candidate = ctx.uiSession?.adapter?.current
  const store =
    candidate !== undefined &&
    typeof candidate.getSnapshot === 'function' &&
    typeof candidate.subscribe === 'function'
      ? candidate
      : null
  log('apply', { hasUiSession: ctx.uiSession !== undefined, hasStore: store !== null })

  // Warm the media cache before any overlay can open, so the first play starts
  // from the local copy instead of the network. Deliberately here, not at the
  // trigger: the version has to be known before a src is built.
  resolveActiveVersion()

  // The skin is painted from localStorage BEFORE any fetch: it is synchronous,
  // so the backdrop is already there on the first paint, and the sync below
  // only has to discover that the host's selection moved on.
  paintSkin()
  watchScheme()
  if (skinState.on) void syncSkin(false)

  // Rendering a JSX-free tree on purpose (createElement), so no provider
  // element is involved. Hooks live in AppRoot, never in apply: apply is called
  // by the plugin loader, not by React, and a hook call there would throw.
  const AppRoot = () => {
    const [libOpen, setLibOpen] = useState(false)
    // Bumped on preview. Closing the library and bumping in the same handler is
    // what makes it work: BootOverlay only exists while the library is closed.
    const [previewAt, setPreviewAt] = useState(0)

    const openSelf = useCallback(() => setLibOpen(true), [])
    useEffect(() => {
      libraryOpeners.add(openSelf)
      return () => {
        libraryOpeners.delete(openSelf)
      }
    }, [openSelf])

    // Rendered as ELEMENTS, never called as plain functions. Calling a
    // component directly would run its hooks against AppRoot's own hook list,
    // so toggling the library would change AppRoot's hook count between renders
    // and React would throw "Rendered more hooks than during the previous
    // render" the moment the picker opened.
    //
    // No `activeId` state lives here: the overlay always loads VIDEO_URL and the
    // host resolves which clip that is per request, so a switch is picked up on
    // the next open without threading an id into the src mid-playback.
    if (libOpen) {
      return h(VideoLibrary, {
        onClose: () => setLibOpen(false),
        onPreview: () => {
          setLibOpen(false)
          setPreviewAt((n) => n + 1)
        },
      })
    }
    return h(BootOverlay, { store, previewAt })
  }

  const Pin = () => h(PinAction, { store, onOpen: () => openLibrary() })

  // Slot names are inlined on purpose: the injector's pre-flight check reads
  // register() calls statically and cannot follow a constant.
  const mount = () => {
    ctx.slots.inject('shell.overlay', () =>
      ctx.slots.register({ name: 'shell.overlay', id: 'dsh-boot-animation', order: 900 }, AppRoot),
    )
    ctx.slots.inject('sidebar.footer.action', () =>
      ctx.slots.register(
        { name: 'sidebar.footer.action', id: 'dsh-boot-animation-pin', order: 40, label: () => '片头动画' },
        Pin,
      ),
    )
  }
  if (typeof ctx.effect === 'function') ctx.effect(mount, 'dsh-boot-animation: mounts')
  else mount()
}
