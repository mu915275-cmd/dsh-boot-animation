window.__ModuleLoader__.load({
	id: "dsh-boot-animation",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		//#region src/client/index.ts
		/** Slot service for both seats, ui-session for the current conversation. */
		const inject = ["slots", "uiSession"];
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
		const VIDEO_URL = "/dsh-boot-animation/boot.mp4";
		const LIST_URL = "/dsh-boot-animation/videos.json";
		const SELECT_URL = "/dsh-boot-animation/select";
		const SEEN_KEY = "dsh-boot-animation:seen";
		const PIN_KEY = "dsh-boot-animation:pinned";
		const FIT_KEY = "dsh-boot-animation:fit";
		const MAX_SEEN = 80;
		/** Never let a stalled video trap the user behind the overlay. */
		const STALL_TIMEOUT_MS = 25e3;
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
		let activeVersion = null;
		let versionStarted = false;
		function resolveActiveVersion() {
			if (versionStarted) return;
			versionStarted = true;
			(async () => {
				try {
					const response = await fetch(LIST_URL, { cache: "no-store" });
					if (!response.ok) return;
					const version = (await response.json()).activeVersion;
					if (typeof version !== "string" || version === "") return;
					activeVersion = version;
					await fetch(videoSrc(), { cache: "force-cache" });
					notify("media prefetched", videoSrc());
				} catch (error) {
					notify("prefetch failed", String(error));
				}
			})();
		}
		/** The URL to play, carrying the content key when it is already known. */
		function videoSrc() {
			return activeVersion === null ? VIDEO_URL : VIDEO_URL + "?v=" + encodeURIComponent(activeVersion);
		}
		function readFit() {
			try {
				return window.localStorage.getItem(FIT_KEY) === "contain" ? "contain" : "cover";
			} catch {
				return "cover";
			}
		}
		function writeFit(fit) {
			try {
				window.localStorage.setItem(FIT_KEY, fit);
			} catch {}
		}
		function formatArgs(args) {
			return args.map((a) => {
				if (typeof a === "object" && a !== null) try {
					return JSON.stringify(a);
				} catch {
					return String(a);
				}
				return String(a);
			}).join(" ");
		}
		function narrate(text) {
			try {
				console.log("[dsh-boot-animation] " + text);
			} catch {}
		}
		/**
		* The always-on subset. A black overlay reports nothing by itself — no network
		* error, no thrown exception, just a video element that never paints — so the
		* four things needed to diagnose one from the outside are logged unconditionally:
		* which URL the element actually used, when the first frame arrived, when the
		* element errored and with which code, and when the stall watchdog gave up.
		* They are one line each and only fire on a play, so the noise is bounded.
		*/
		function notify(...args) {
			narrate(formatArgs(args));
		}
		function readSeen() {
			try {
				const parsed = JSON.parse(window.localStorage.getItem(SEEN_KEY) ?? "[]");
				return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [];
			} catch {
				return [];
			}
		}
		function hasPlayed(sessionId) {
			return readSeen().includes(sessionId);
		}
		function markPlayed(sessionId) {
			try {
				const seen = readSeen();
				if (!seen.includes(sessionId)) seen.push(sessionId);
				while (seen.length > MAX_SEEN) seen.shift();
				window.localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
			} catch {}
		}
		function readPinned() {
			try {
				const value = window.localStorage.getItem(PIN_KEY);
				return value === null || value === "" ? null : value;
			} catch {
				return null;
			}
		}
		function writePinned(sessionId) {
			try {
				if (sessionId === null) window.localStorage.removeItem(PIN_KEY);
				else window.localStorage.setItem(PIN_KEY, sessionId);
			} catch {}
		}
		const STYLE_ID = "dsh-boot-animation-style";
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
.dba-item{display:flex;align-items:center;gap:10px;padding:3px 10px;border-radius:9px;
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
.dba-sec-head{display:flex;align-items:baseline;gap:8px;margin:6px 0 2px;
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
/* Text over the picture, one block per area.
   The theme names these --dsw-alias-label-* (there is no --dsw-alias-text-*; the
   picker's own CSS falls back to the label names for that reason), and body text
   is spread over five of them, so a single override would leave words unreadable.
   Only the CONTENT family is overridden. Three members are deliberately left
   alone, and each one was found the hard way:
     - label-primary-inverted / label-primary-foreground mean "text on a light
       chip" and "text on a coloured button"; repainting them erases button labels;
     - label-primary-bluish is the text of a BLUISH surface (the 预览版 pill), and
       those info-tinted surfaces keep their colour, so repainting this one made the
       badge white on pale blue.
   The two areas are found by the stable semantic suffix of their column class
   (the hash prefix changes between builds, the suffix does not).
   Both blocks are gated on the on-classes paintSkin toggles, because an unset
   colour must not inject an invalid var() into the theme's own tokens. */
html.dba-skin-on.dba-text-ws-on [class*="_centerCol"],
html.dba-skin-on.dba-text-ws-on.dba-skin-window [class*="_rightbarCol"]{
  --dsw-alias-label-primary:var(--dba-text-ws)!important;
  --dsw-alias-label-primary-dimmed:var(--dba-text-ws)!important;
  --dsw-alias-label-secondary:var(--dba-text-ws)!important;
  --dsw-alias-label-tertiary:var(--dba-text-ws)!important;
  --dsw-alias-label-caption:var(--dba-text-ws)!important}
html.dba-skin-on.dba-text-side-on [class*="_sidebarCol"]{
  --dsw-alias-label-primary:var(--dba-text-side)!important;
  --dsw-alias-label-primary-dimmed:var(--dba-text-side)!important;
  --dsw-alias-label-secondary:var(--dba-text-side)!important;
  --dsw-alias-label-tertiary:var(--dba-text-side)!important;
  --dsw-alias-label-caption:var(--dba-text-side)!important;
  --dsw-alias-menu-icon:var(--dba-text-side)!important;
  --dsw-alias-brand-text:var(--dba-text-side)!important}
.dba-color{display:inline-flex;align-items:center;gap:5px;font-size:12px;
  color:var(--dsw-alias-text-secondary,var(--dsw-alias-label-secondary,#777));cursor:pointer}
.dba-color input[type=color]{width:26px;height:20px;padding:0;border:1px solid rgba(127,127,127,.45);
  border-radius:5px;background:transparent;cursor:pointer}
/* THE SURFACES FOLLOW THE TEXT when the two disagree.
   Cards, bubbles and the composer paint their own fill (--dsw-specific-input-major
   is the composer card, --dsw-specific-bubble is a message bubble, and the
   sidebar's new-session button is --dsw-alias-button-elevated-fill), and that fill
   is paired with the PALETTE's text colour. White text in the light palette was
   therefore white on a white card: the words the user reported as unreadable.
   The scrim class is only set when the chosen colour's polarity is the opposite of
   the palette's, so a colour that agrees with the theme changes nothing at all.
   Only NEUTRAL surfaces are listed. Coloured fills (brand, info, contrast) keep
   both their colour and their labels: those labels come from the
   label-*-inverted / -foreground tokens this feature never repaints, so flipping a
   coloured button's fill would erase its label. */
html.dba-skin-on.dba-text-ws-scrim [class*="_centerCol"],
html.dba-skin-on.dba-text-ws-scrim.dba-skin-window [class*="_rightbarCol"]{
  --dsw-specific-input-major:var(--dba-ws-card)!important;
  --dsw-specific-input-minor:var(--dba-ws-card)!important;
  --dsw-specific-bubble:var(--dba-ws-card)!important;
  --dsw-specific-menu:var(--dba-ws-card)!important;
  --dsw-menu-surface-fill:var(--dba-ws-card)!important;
  --dsw-alias-settings-card-fill:var(--dba-ws-card)!important;
  --dsw-alias-button-floating-fill:var(--dba-ws-card)!important;
  --dsw-alias-markdown-inline-code:var(--dba-ws-card)!important;
  --dsw-alias-markdown-code-block:var(--dba-ws-card)!important;
  --dsw-alias-markdown-code-block-banner:var(--dba-ws-card)!important;
  --dsw-alias-markdown-citation:var(--dba-ws-card)!important;
  --deliverable-fill:var(--dba-ws-card)!important;
  --dsw-specific-selector:var(--dba-ws-soft)!important;
  --dsw-alias-button-elevated-fill:var(--dba-ws-soft)!important;
  --dsw-alias-bg-layer-1:var(--dba-ws-soft)!important;
  --dsw-alias-bg-layer-2:var(--dba-ws-soft)!important;
  --dsw-alias-bg-layer-3:var(--dba-ws-soft)!important;
  --dsw-alias-interactive-bg-hover-solid:var(--dba-ws-soft)!important;
  --dsw-alias-markdown-tag:var(--dba-ws-soft)!important;
  --dsw-alias-markdown-placeholder:var(--dba-ws-soft)!important;
  --dsw-alias-markdown-code-segment-selected:var(--dba-ws-soft)!important;
  --dsw-alias-markdown-code-segment-unselected:var(--dba-ws-soft)!important}
html.dba-skin-on.dba-text-side-scrim [class*="_sidebarCol"]{
  --dsw-specific-input-major:var(--dba-side-card)!important;
  --dsw-specific-input-minor:var(--dba-side-card)!important;
  --dsw-specific-bubble:var(--dba-side-card)!important;
  --dsw-specific-menu:var(--dba-side-card)!important;
  --dsw-menu-surface-fill:var(--dba-side-card)!important;
  --dsw-alias-settings-card-fill:var(--dba-side-card)!important;
  --dsw-alias-button-floating-fill:var(--dba-side-card)!important;
  --dsw-alias-markdown-inline-code:var(--dba-side-card)!important;
  --dsw-alias-markdown-code-block:var(--dba-side-card)!important;
  --dsw-alias-markdown-code-block-banner:var(--dba-side-card)!important;
  --dsw-alias-markdown-citation:var(--dba-side-card)!important;
  --deliverable-fill:var(--dba-side-card)!important;
  --dsw-specific-selector:var(--dba-side-soft)!important;
  --dsw-alias-button-elevated-fill:var(--dba-side-soft)!important;
  --dsw-alias-bg-layer-1:var(--dba-side-soft)!important;
  --dsw-alias-bg-layer-2:var(--dba-side-soft)!important;
  --dsw-alias-bg-layer-3:var(--dba-side-soft)!important;
  --dsw-alias-interactive-bg-hover-solid:var(--dba-side-soft)!important;
  --dsw-alias-markdown-tag:var(--dba-side-soft)!important;
  --dsw-alias-markdown-placeholder:var(--dba-side-soft)!important;
  --dsw-alias-markdown-code-segment-selected:var(--dba-side-soft)!important;
  --dsw-alias-markdown-code-segment-unselected:var(--dba-side-soft)!important}
/* Text that sits on the PICTURE itself cannot be made legible by any colour alone:
   a bright clip defeats light text and a dark one defeats dark text. A halo of the
   opposite polarity does make it legible, and unlike a scrim over the whole column
   it leaves the picture visible. It is inherited, so one declaration covers every
   run of text in the area; on a card the shadow simply disappears into the fill. */
html.dba-skin-on.dba-text-ws-on [class*="_centerCol"],
html.dba-skin-on.dba-text-ws-on.dba-skin-window [class*="_rightbarCol"]{
  text-shadow:0 1px 2px var(--dba-ws-halo),0 0 5px var(--dba-ws-halo)}
html.dba-skin-on.dba-text-side-on [class*="_sidebarCol"]{
  text-shadow:0 1px 2px var(--dba-side-halo),0 0 5px var(--dba-side-halo)}
/* Two surfaces cannot be reached through a token at all, so they are named.
   The file/deliverable card paints its fill from a palette-scoped HARDCODED colour
   (setting all 433 custom properties on it, and on its four ancestors, moves nothing,
   yet it is #fafafa in the light palette and #212123 in the dark one), so no variable
   can flip it. The transcript separator is worse: it paints its LINE from
   --dsw-alias-label-caption, i.e. from a text colour, so repainting the text turned the
   line white. Both are matched by the END of the class name (the hash prefix changes
   between builds; an exact suffix is safe in a way a substring is not). */
html.dba-skin-on.dba-text-ws-scrim [class*="_centerCol"] [class$="_file"],
html.dba-skin-on.dba-text-ws-scrim [class*="_centerCol"] [class$="_deliverable"],
html.dba-skin-on.dba-text-ws-scrim.dba-skin-window [class*="_rightbarCol"] [class$="_file"],
html.dba-skin-on.dba-text-ws-scrim.dba-skin-window [class*="_rightbarCol"] [class$="_deliverable"]{
  background-color:var(--dba-ws-card)!important}
html.dba-skin-on.dba-text-ws-scrim [class*="_sidebarCol"] [class$="_file"],
html.dba-skin-on.dba-text-ws-scrim [class*="_sidebarCol"] [class$="_deliverable"]{
  background-color:var(--dba-side-card)!important}
html.dba-skin-on.dba-text-ws-on [class*="_centerCol"] [class$="_separator"],
html.dba-skin-on.dba-text-ws-on.dba-skin-window [class*="_rightbarCol"] [class$="_separator"]{
  background-color:var(--dba-ws-halo)!important}
html.dba-skin-on.dba-text-side-on [class*="_sidebarCol"] [class$="_separator"]{
  background-color:var(--dba-side-halo)!important}
/* The sidebar column's own fill is a colour-mix of a neutral, so it needs the same
   flip: a light palette with light text has to mix from the DARK neutral. */
html.dba-skin-on.dba-skin-window.dba-text-side-scrim body{--dsw-specific-sidebar-fill:color-mix(in srgb,var(--dsw-static-neutral-bluish-900) var(--dba-skin-sidebar,65%),transparent)!important}
html.dba-skin-on.dba-skin-window.dba-text-side-scrim body[data-ds-dark-theme]{--dsw-specific-sidebar-fill:color-mix(in srgb,var(--dsw-static-neutral-bluish-50) var(--dba-skin-sidebar,65%),transparent)!important}
.dba-range{flex:1;min-width:130px;max-width:230px;height:18px;margin:0;
  accent-color:#07c160;cursor:pointer}
.dba-range:disabled{opacity:.42;cursor:default}
.dba-num{font-size:12px;min-width:40px;text-align:right;font-variant-numeric:tabular-nums;
  color:var(--dsw-alias-text-secondary,var(--dsw-alias-label-secondary,#777))}
`;
		function ensureStyle() {
			if (document.getElementById(STYLE_ID) !== null) return;
			const style = document.createElement("style");
			style.id = STYLE_ID;
			style.textContent = CSS;
			document.head.appendChild(style);
		}
		const noopSubscribe = () => () => {};
		/** Subscribe to the current-conversation store, tolerating its absence. */
		function useCurrentSession(store) {
			const binding = (0, react.useSyncExternalStore)(store === null ? noopSubscribe : store.subscribe, store === null ? () => null : store.getSnapshot);
			return {
				sessionId: typeof binding?.props?.sessionId === "string" ? binding.props.sessionId : null,
				isNewConversation: binding?.hooks?.session?.blankBit === true
			};
		}
		function BootOverlay({ store, previewAt = 0 }) {
			ensureStyle();
			const { sessionId, isNewConversation } = useCurrentSession(store);
			const fit = readFit();
			const [showing, setShowing] = (0, react.useState)(false);
			const [needsTap, setNeedsTap] = (0, react.useState)(false);
			const [phase, setPhase] = (0, react.useState)("loading");
			/**
			* Frozen at mount, deliberately: `videoSrc()` reads a value that resolves from
			* an async fetch, and letting the src change after mount is exactly the black
			* frame bug this plugin already paid for once (see the note above VIDEO_URL).
			*/
			const [src] = (0, react.useState)(videoSrc);
			const videoRef = (0, react.useRef)(null);
			const closedRef = (0, react.useRef)(false);
			const lastSessionRef = (0, react.useRef)(null);
			const close = (0, react.useCallback)(() => {
				closedRef.current = true;
				setShowing(false);
				const video = videoRef.current;
				if (video !== null) try {
					video.pause();
				} catch {}
				if (document.fullscreenElement !== null && document.exitFullscreen !== void 0) document.exitFullscreen().catch(() => {});
			}, []);
			const open = (0, react.useCallback)(() => {
				closedRef.current = false;
				setNeedsTap(false);
				setShowing(true);
			}, []);
			(0, react.useEffect)(() => {
				if (sessionId === null) return;
				const entered = lastSessionRef.current !== sessionId;
				lastSessionRef.current = sessionId;
				if (!entered) return;
				const pinned = readPinned();
				if (pinned !== null && pinned === sessionId) {
					open();
					return;
				}
				if (isNewConversation && !hasPlayed(sessionId)) {
					markPlayed(sessionId);
					open();
				}
			}, [
				sessionId,
				isNewConversation,
				open
			]);
			(0, react.useEffect)(() => {
				if (previewAt === 0) return;
				open();
			}, [previewAt, open]);
			(0, react.useEffect)(() => {
				if (!showing) return void 0;
				const video = videoRef.current;
				if (video === null) return void 0;
				video.muted = true;
				const openedAt = performance.now();
				/** One line that carries everything a black-frame report needs. */
				const report = (label) => notify(label, {
					ms: Math.round(performance.now() - openedAt),
					readyState: video.readyState,
					networkState: video.networkState,
					src: video.currentSrc || video.src
				});
				const onPlaying = () => {
					setPhase("playing");
					report("first frame painted");
				};
				video.addEventListener("playing", onPlaying);
				const attempt = video.play();
				if (attempt !== void 0 && typeof attempt.then === "function") attempt.then(() => void 0).catch((error) => {
					setNeedsTap(true);
				});
				const guard = window.setTimeout(() => {
					if (!closedRef.current) {
						setPhase("stalled");
						report("stalled, giving up after 25000ms");
						close();
					}
				}, STALL_TIMEOUT_MS);
				return () => {
					video.removeEventListener("playing", onPlaying);
					window.clearTimeout(guard);
				};
			}, [showing, close]);
			if (!showing) return null;
			const activate = () => {
				const video = videoRef.current;
				if (video === null) return;
				if (needsTap) {
					setNeedsTap(false);
					video.muted = false;
					const attempt = video.play();
					if (attempt !== void 0 && typeof attempt.catch === "function") attempt.catch(() => {});
				} else if (video.muted) video.muted = false;
				if (document.fullscreenElement === null && typeof video.requestFullscreen === "function") video.requestFullscreen().catch(() => {});
			};
			return (0, react.createElement)("div", {
				className: "dba-root",
				onClick: activate
			}, (0, react.createElement)("video", {
				ref: videoRef,
				className: fit === "cover" ? "dba-video dba-cover" : "dba-video",
				src,
				muted: true,
				autoPlay: true,
				playsInline: true,
				preload: "auto",
				onEnded: close,
				onError: () => {
					const video = videoRef.current;
					notify("video element error", {
						code: video?.error?.code ?? 0,
						message: video?.error?.message ?? "",
						src: video?.currentSrc || src,
						readyState: video?.readyState ?? -1
					});
					setPhase("error");
					window.setTimeout(() => {
						if (!closedRef.current) close();
					}, 8e3);
				},
				onClick: (event) => event.stopPropagation()
			}), phase === "playing" ? null : (0, react.createElement)("div", { className: "dba-status" }, phase === "error" ? "视频加载失败 —— 控制台有 [dsh-boot-animation] 日志" : phase === "stalled" ? "视频加载超时" : "正在加载视频…"), (0, react.createElement)("button", {
				type: "button",
				className: "dba-skip",
				onClick: (event) => {
					event.stopPropagation();
					close();
				}
			}, "跳过"), (0, react.createElement)("div", { className: "dba-hint" }, needsTap ? "点击播放" : "点击开启声音 · 全屏"));
		}
		/** The pin toggle that lives beside Settings at the sidebar foot. */
		function PinAction({ store, onOpen }) {
			ensureStyle();
			const { sessionId } = useCurrentSession(store);
			const [pinned, setPinned] = (0, react.useState)(() => readPinned());
			const isPinned = sessionId !== null && pinned === sessionId;
			const toggle = () => {
				const next = isPinned ? null : sessionId;
				writePinned(next);
				setPinned(next);
			};
			const title = isPinned ? "这个会话已设为片头会话：每次打开都会播放片头动画（点击取消）" : "把这个会话设为片头会话：以后每次打开它都会播放片头动画";
			return (0, react.createElement)("span", {
				className: "dba-pin-wrap",
				style: {
					display: "inline-flex",
					alignItems: "center"
				}
			}, (0, react.createElement)("button", {
				type: "button",
				className: isPinned ? "dba-pin dba-pin-on" : "dba-pin",
				title,
				"aria-label": title,
				disabled: sessionId === null,
				onClick: toggle
			}, isPinned ? "🎬" : "🎞"), (0, react.createElement)("button", {
				type: "button",
				className: "dba-pin dba-lib-open",
				title: "片头片库：查看、切换或添加片头视频",
				"aria-label": "打开片头片库",
				onClick: onOpen
			}, "🎛"));
		}
		const ROLE_LABEL = {
			intro: "入场动画",
			wallpaper: "工作区壁纸"
		};
		function formatBytes(n) {
			if (!Number.isFinite(n) || n <= 0) return "0 B";
			if (n < 1024) return n + " B";
			if (n < 1048576) return (n / 1024).toFixed(0) + " KB";
			return (n / 1024 / 1024).toFixed(2) + " MB";
		}
		/**
		* Where a clip comes from, as one word a user can act on.
		*
		* The plugin's clips are embedded in code now, so there is a single built-in
		* kind; anything else on the list is a file the user put there.
		*/
		const SOURCE_LABEL = {
			yours: "你自己加的",
			embedded: "插件内置",
			env: "环境变量"
		};
		/**
		* The video library: every .mp4 the host can see, the active one marked, and a
		* click to switch. Adding a video stays a filesystem action — the user drops a
		* file in and presses refresh — because a browser-side upload would have to
		* carry the bytes through this route for no gain on a local-only plugin.
		*/
		function VideoLibrary({ onClose, onPreview }) {
			ensureStyle();
			const [state, setState] = (0, react.useState)(null);
			const [fit, setFit] = (0, react.useState)(() => readFit());
			const [msg, setMsg] = (0, react.useState)({
				text: "",
				kind: ""
			});
			const [busy, setBusy] = (0, react.useState)(false);
			const skin = useSkinState();
			const load = (0, react.useCallback)(async () => {
				try {
					const data = await (await fetch(LIST_URL, { cache: "no-store" })).json();
					setState(data);
					setMsg({
						text: "",
						kind: ""
					});
					if (typeof data.activeVersion === "string" && data.activeVersion !== "") activeVersion = data.activeVersion;
				} catch (error) {
					setMsg({
						text: "读取片库失败：" + String(error),
						kind: "dba-err"
					});
				}
			}, []);
			(0, react.useEffect)(() => {
				load();
			}, [load]);
			(0, react.useEffect)(() => {
				const onKey = (event) => {
					if (event.key === "Escape") onClose();
				};
				window.addEventListener("keydown", onKey);
				return () => window.removeEventListener("keydown", onKey);
			}, [onClose]);
			const choose = (0, react.useCallback)(async (role, id) => {
				setBusy(true);
				try {
					const data = await (await fetch(SELECT_URL, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({
							id,
							role
						})
					})).json();
					if (data.ok === true) {
						setMsg({
							text: "「" + ROLE_LABEL[role] + "」已设为：" + String(data.name ?? id) + (role === "intro" ? "（下次播放片头生效）" : "（壁纸立刻更新）"),
							kind: "dba-ok"
						});
						await load();
						if (role === "wallpaper" && skinState.on) syncSkin(false);
					} else setMsg({
						text: "切换失败：" + String(data.error ?? "未知错误"),
						kind: "dba-err"
					});
				} catch (error) {
					setMsg({
						text: "切换失败：" + String(error),
						kind: "dba-err"
					});
				} finally {
					setBusy(false);
				}
			}, [load]);
			const videos = state === null ? [] : state.videos;
			/**
			* One role's list. The rows are identical to the old single list -- same
			* badges, same size, same de-dup annotations -- only the tick and the click
			* target belong to one role now.
			*/
			const renderRole = (role, hint) => [(0, react.createElement)("div", { className: "dba-sec-head" }, (0, react.createElement)("span", { className: "dba-sec-name" }, ROLE_LABEL[role]), (0, react.createElement)("span", { className: "dba-sec-hint" }, hint)), ...videos.length === 0 ? [(0, react.createElement)("div", { className: "dba-item" }, (0, react.createElement)("span", { className: "dba-nm" }, "（还没找到任何视频）"))] : videos.map((v) => {
				const isPicked = role === "intro" ? v.active === true : v.wallpaper === true;
				return (0, react.createElement)("div", {
					key: v.id,
					className: "dba-item" + (isPicked ? " dba-cur" : ""),
					title: v.file,
					onClick: () => {
						if (!busy && !isPicked) choose(role, v.id);
					}
				}, (0, react.createElement)("span", { className: "dba-mark" }, isPicked ? "✓" : ""), (0, react.createElement)("span", { className: "dba-nm" }, v.name), v.legacy ? (0, react.createElement)("span", { className: "dba-badge" }, "原片源") : null, (v.copies ?? 1) > 1 ? (0, react.createElement)("span", {
					className: "dba-badge",
					title: "这一段在磁盘上有 " + String(v.copies) + " 份相同的副本，已合并成一条。你的文件没有被删，只是不重复列出。"
				}, "合并 " + String(v.copies) + " 份重复") : null, (v.ext === ".mp4" || v.ext === ".m4v") && v.faststart === false ? (0, react.createElement)("span", {
					className: "dba-badge dba-b-warn",
					title: "这个文件的索引表(moov)在末尾：浏览器要整段下载完才出画面，容易黑屏。用 ffmpeg -c copy -movflags +faststart 重排一次即可。"
				}, "⚠ 未优化") : null, (0, react.createElement)("span", { className: "dba-badge" }, SOURCE_LABEL[v.source] ?? v.source), (0, react.createElement)("span", { className: "dba-meta" }, formatBytes(v.bytes)));
			})];
			return (0, react.createElement)("div", {
				className: "dba-veil",
				onClick: (event) => {
					if (event.target === event.currentTarget) onClose();
				}
			}, (0, react.createElement)("div", {
				className: "dba-lib",
				onClick: (event) => event.stopPropagation()
			}, (0, react.createElement)("h3", null, "片头片库"), (0, react.createElement)("p", null, "两件东西各自选一段 —— 它们互不影响。"), ...renderRole("intro", "开新对话、以及打开你钉住的会话时播放"), ...renderRole("wallpaper", "铺在工作区画布后面的皮肤：静帧取尾帧，动态循环片尾"), (0, react.createElement)("div", { className: "dba-dir" }, "想加自己的片子：把 mp4 放进这个文件夹，再点「刷新」", (0, react.createElement)("br", null), (0, react.createElement)("code", null, state === null ? "…" : state.userDir)), (0, react.createElement)("div", { className: "dba-fit" }, (0, react.createElement)("span", null, "播放时："), (0, react.createElement)("button", {
				type: "button",
				className: "dba-btn" + (fit === "cover" ? " dba-btn-on" : ""),
				title: "铺满整个窗口，超出部分裁掉 —— 不留黑边",
				onClick: () => {
					writeFit("cover");
					setFit("cover");
					setMsg({
						text: "已设为「铺满屏幕」：下次播放生效",
						kind: "dba-ok"
					});
				}
			}, "铺满屏幕"), (0, react.createElement)("button", {
				type: "button",
				className: "dba-btn" + (fit === "contain" ? " dba-btn-on" : ""),
				title: "完整显示整帧，长宽比不匹配时留黑边",
				onClick: () => {
					writeFit("contain");
					setFit("contain");
					setMsg({
						text: "已设为「完整显示」：下次播放生效",
						kind: "dba-ok"
					});
				}
			}, "完整显示")), (0, react.createElement)("div", { className: "dba-fit" }, (0, react.createElement)("span", null, "工作区皮肤："), (0, react.createElement)("button", {
				type: "button",
				className: "dba-btn" + (skin.on ? " dba-btn-on" : ""),
				title: "把当前选中那段的尾帧铺成工作区背景。换一段片子，皮肤跟着换。",
				onClick: () => setSkinOn(!skin.on)
			}, skin.on ? "已开启" : "用尾帧"), ...LOOK_ORDER.map((look) => (0, react.createElement)("button", {
				key: look,
				type: "button",
				className: "dba-btn" + (skin.on && skin.look === look ? " dba-btn-on" : ""),
				disabled: !skin.on,
				title: "模糊程度：清晰=原图，柔和=轻模糊，沉浸=重模糊。越模糊越不抢文字。",
				onClick: () => setSkinLook(look)
			}, LOOK_LABEL[look]))), (0, react.createElement)("div", { className: "dba-fit" }, (0, react.createElement)("span", null, "透明度："), (0, react.createElement)("input", {
				type: "range",
				min: 0,
				max: 100,
				step: 5,
				className: "dba-range",
				value: String(skin.strength),
				disabled: !skin.on,
				title: "0 = 皮肤最清楚（文字也最直接压在图上），100 = 完全透明（等于没有皮肤）。侧边栏跟着一起变。",
				onChange: (event) => setSkinStrength(Number(event.target.value))
			}), (0, react.createElement)("span", { className: "dba-num" }, String(skin.strength) + "%")), (0, react.createElement)("div", { className: "dba-fit" }, (0, react.createElement)("span", null, "皮肤画面："), (0, react.createElement)("button", {
				type: "button",
				className: "dba-btn" + (skin.on && skin.motion === "still" ? " dba-btn-on" : ""),
				disabled: !skin.on,
				title: "尾帧定格当背景：零开销，刷新后立刻就在",
				onClick: () => setSkinMotion("still")
			}, "静帧"), (0, react.createElement)("button", {
				type: "button",
				className: "dba-btn" + (skin.on && skin.motion === "live" ? " dba-btn-on" : ""),
				disabled: !skin.on,
				title: "循环播放选中那段片子当背景：会一直在解码并做模糊，比较费电。视频加载好之前显示的仍是尾帧。",
				onClick: () => setSkinMotion("live")
			}, "动态")), (0, react.createElement)("div", { className: "dba-fit" }, (0, react.createElement)("span", null, "动态时长："), ...SPAN_OPTIONS.map((seconds) => (0, react.createElement)("button", {
				key: String(seconds),
				type: "button",
				className: "dba-btn" + (skin.on && skin.span === seconds ? " dba-btn-on" : ""),
				disabled: !skin.on || skin.motion !== "live",
				title: seconds === 0 ? "整段循环：从头播放整支片头" : "只循环这段片子的最后 " + String(seconds) + " 秒 —— 片尾通常是定格的标题卡，循环起来更安静",
				onClick: () => setSkinSpan(seconds)
			}, spanLabel(seconds)))), (0, react.createElement)("div", { className: "dba-fit" }, (0, react.createElement)("span", null, "皮肤范围："), (0, react.createElement)("button", {
				type: "button",
				className: "dba-btn" + (skin.on && skin.scope === "window" ? " dba-btn-on" : ""),
				disabled: !skin.on,
				title: "整张铺满窗口，侧边栏变成半透明玻璃",
				onClick: () => setSkinScope("window")
			}, "整个窗口"), (0, react.createElement)("button", {
				type: "button",
				className: "dba-btn" + (skin.on && skin.scope === "conversation" ? " dba-btn-on" : ""),
				disabled: !skin.on,
				title: "只有中间的对话区露出皮肤，侧边栏保持原来的实底",
				onClick: () => setSkinScope("conversation")
			}, "仅对话区")), (0, react.createElement)("div", { className: "dba-fit" }, (0, react.createElement)("span", null, "侧边栏透明度："), (0, react.createElement)("input", {
				type: "range",
				min: 0,
				max: 100,
				step: 5,
				className: "dba-range",
				value: String(skin.sidebar),
				disabled: !skin.on || skin.scope !== "window",
				title: "单独调侧边栏：0 = 保持它自己的实底（完全挡住皮肤），100 = 完全透出皮肤。和上面皮肤那根滑块互相独立。范围选「仅对话区」时这一项不生效。",
				onChange: (event) => setSkinSidebar(Number(event.target.value))
			}), (0, react.createElement)("span", { className: "dba-num" }, String(skin.sidebar) + "%")), (0, react.createElement)("div", { className: "dba-fit" }, (0, react.createElement)("span", { title: "皮肤后面那层图上的文字颜色。透明度过低、或图本身偏暗时，主题自带的字会看不清。选了浅色字，该区域的卡片底会自动变深（否则白底白字）；选了深色字则相反。" }, "字体颜色："), (0, react.createElement)("label", {
				className: "dba-color",
				title: "工作区（对话区 + 右侧栏）的字色"
			}, "工作区", (0, react.createElement)("input", {
				type: "color",
				disabled: !skin.on,
				value: skin.textWorkspace === "" ? currentTextColor("workspace") : skin.textWorkspace,
				onChange: (event) => setSkinText("workspace", event.target.value)
			})), (0, react.createElement)("label", {
				className: "dba-color",
				title: "侧边栏的字色（含图标与 logo 文字）"
			}, "侧边栏", (0, react.createElement)("input", {
				type: "color",
				disabled: !skin.on,
				value: skin.textSidebar === "" ? currentTextColor("sidebar") : skin.textSidebar,
				onChange: (event) => setSkinText("sidebar", event.target.value)
			})), (0, react.createElement)("button", {
				type: "button",
				className: "dba-btn",
				disabled: !skin.on || skin.textWorkspace === "" && skin.textSidebar === "",
				title: "两个区域都恢复主题自带的文字颜色",
				onClick: () => {
					setSkinText("workspace", "");
					setSkinText("sidebar", "");
				}
			}, "默认")), (0, react.createElement)("div", { className: "dba-msg " + (skin.status === "error" ? "dba-err" : skin.status === "ready" ? "dba-ok" : "") }, skin.detail), (0, react.createElement)("div", { className: "dba-bar" }, (0, react.createElement)("button", {
				type: "button",
				className: "dba-btn dba-btn-preview",
				title: "立刻播放当前选中的入场动画，不用等下一次开新对话或钉住的会话",
				onClick: onPreview
			}, "▶ 预览入场动画"), (0, react.createElement)("button", {
				type: "button",
				className: "dba-btn",
				onClick: () => void load()
			}, "刷新"), (0, react.createElement)("button", {
				type: "button",
				className: "dba-btn",
				onClick: onClose
			}, "关闭")), (0, react.createElement)("div", { className: "dba-msg " + msg.kind }, msg.text)));
		}
		const SKIN_ON_KEY = "dsh-boot-animation:skin";
		const SKIN_LOOK_KEY = "dsh-boot-animation:skin-look";
		const SKIN_SCOPE_KEY = "dsh-boot-animation:skin-scope";
		const SKIN_STRENGTH_KEY = "dsh-boot-animation:skin-strength";
		const SKIN_SIDEBAR_KEY = "dsh-boot-animation:skin-sidebar";
		const SKIN_MOTION_KEY = "dsh-boot-animation:skin-motion";
		const SKIN_SPAN_KEY = "dsh-boot-animation:skin-span";
		/**
		* Text colours, one per area, stored as `#rrggbb` (absent = the theme's own).
		*
		* The reason this exists: at 0% transparency the picture is at full strength, and
		* a dark frame under the dark palette's near-black text is unreadable. "Make the
		* text lighter" is not a property of one token though -- the theme spreads body
		* text over six label tokens -- so this repaints the whole label family inside
		* one area, and each area gets its own value because the sidebar and the canvas
		* sit on top of the picture to different degrees.
		*/
		const SKIN_TEXT_WORKSPACE_KEY = "dsh-boot-animation:skin-text-workspace";
		const SKIN_TEXT_SIDEBAR_KEY = "dsh-boot-animation:skin-text-sidebar";
		/** Transparency percent: 0 shows the frame at full strength, 100 shows none of it. */
		const SKIN_STRENGTH_DEFAULT = 30;
		/**
		* The sidebar's OWN transparency percent: 0 keeps its solid fill, 100 lets the
		* skin through completely. Deliberately separate from the skin's strength --
		* the two are different questions ("how visible is the picture" vs "how much of
		* the sidebar's surface do I give up for it"), and coupling them made
		* "clear skin + solid sidebar" unexpressible.
		*/
		const SKIN_SIDEBAR_DEFAULT = 35;
		/**
		* How much of the clip's END the live mode loops, in seconds; 0 means the whole
		* clip. These intros settle into a title card for their last seconds, so looping
		* only the tail is a calmer backdrop than replaying the whole animation -- and
		* it is what "the last 3 seconds" asks for.
		*/
		const SKIN_SPAN_DEFAULT = 3;
		const SPAN_OPTIONS = [
			0,
			5,
			3,
			1
		];
		const spanLabel = (seconds) => seconds === 0 ? "全程" : String(seconds) + " 秒";
		/** The one stored frame. Only the ACTIVE clip is ever skinned, so one entry is enough. */
		const SKIN_FRAME_KEY = "dsh-boot-animation:skin-frame";
		const SKIN_LAYER_ID = "dsh-boot-animation-skin";
		const MEDIA_URL = "/dsh-boot-animation/media/";
		/** Seconds back from the end, tried in order until a frame carries a picture. */
		const TAIL_BACKOFF_S = [
			.06,
			.3,
			.6,
			1,
			1.5,
			2.2
		];
		/** Cap the raster's long edge: a 4K clip would otherwise blow the storage quota. */
		const FRAME_MAX_EDGE = 1920;
		const FRAME_QUALITY = .82;
		const SKIN_TIMEOUT_MS = 2e4;
		/** A frame below this mean luma (0..1) counts as black; below this spread, as flat. */
		const MIN_LUMA = .05;
		const MIN_SPREAD = .012;
		const LOOK_ORDER = [
			"crisp",
			"soft",
			"deep"
		];
		const LOOK_LABEL = {
			crisp: "清晰",
			soft: "柔和",
			deep: "沉浸"
		};
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
		const BRIGHTNESS = {
			dark: .92,
			light: 1.2
		};
		const LOOKS = {
			crisp: { blur: 0 },
			soft: { blur: 18 },
			deep: { blur: 48 }
		};
		function readFlag(key) {
			try {
				return window.localStorage.getItem(key);
			} catch {
				return null;
			}
		}
		function writeFlag(key, value) {
			try {
				window.localStorage.setItem(key, value);
			} catch {}
		}
		function readLook() {
			const value = readFlag(SKIN_LOOK_KEY);
			return value === "crisp" || value === "deep" ? value : "soft";
		}
		function readScope() {
			return readFlag(SKIN_SCOPE_KEY) === "conversation" ? "conversation" : "window";
		}
		/**
		* Transparency percent, clamped to the control's own range.
		*
		* The stored value is read as a STRING first: `Number(null)` is 0, not NaN, so
		* feeding an absent key straight into Number() silently turns every default
		* into 0 -- which is how "透明度 defaults to 30%" became "defaults to 0%".
		*/
		function readPercent(key, fallback) {
			const stored = readFlag(key);
			if (stored === null || stored.trim() === "") return fallback;
			const raw = Number(stored);
			if (!Number.isFinite(raw)) return fallback;
			return Math.min(100, Math.max(0, Math.round(raw)));
		}
		function readStrength() {
			return readPercent(SKIN_STRENGTH_KEY, SKIN_STRENGTH_DEFAULT);
		}
		function readSidebar() {
			return readPercent(SKIN_SIDEBAR_KEY, SKIN_SIDEBAR_DEFAULT);
		}
		/** Still by default: live costs a permanent decode plus a blur every frame. */
		function readMotion() {
			return readFlag(SKIN_MOTION_KEY) === "live" ? "live" : "still";
		}
		function readSpan() {
			const stored = readFlag(SKIN_SPAN_KEY);
			if (stored === null || stored.trim() === "") return SKIN_SPAN_DEFAULT;
			const raw = Number(stored);
			if (!Number.isFinite(raw) || raw < 0) return SKIN_SPAN_DEFAULT;
			return Math.round(raw);
		}
		/** A stored `#rrggbb`, or '' for "use the theme's own text colours". */
		function readTextColor(key) {
			const raw = readFlag(key);
			return typeof raw === "string" && /^#[0-9a-fA-F]{6}$/.test(raw.trim()) ? raw.trim().toLowerCase() : "";
		}
		/** WCAG relative luminance of `#rrggbb`, 0..1. */
		function lumaOf(hex) {
			const parts = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/.exec(hex.toLowerCase());
			if (parts === null) return 0;
			const channel = (value) => {
				const s = parseInt(value, 16) / 255;
				return s <= .03928 ? s / 12.92 : Math.pow((s + .055) / 1.055, 2.4);
			};
			return .2126 * channel(parts[1]) + .7152 * channel(parts[2]) + .0722 * channel(parts[3]);
		}
		/** Whether a colour counts as "light" for the purpose of pairing a surface with it. */
		function isLightColor(hex) {
			return lumaOf(hex) > .35;
		}
		/**
		* The neutral surfaces used inside an area when the chosen text colour fights the
		* palette. Values mirror the dark palette's own layering for light text, and a
		* light card for dark text, at an alpha high enough that the text stays readable
		* over ANY picture underneath (the contract the verification measures).
		*/
		const SCRIM_FOR_LIGHT_TEXT = {
			card: "rgba(30,31,34,0.88)",
			soft: "rgba(56,58,62,0.86)"
		};
		const SCRIM_FOR_DARK_TEXT = {
			card: "rgba(255,255,255,0.90)",
			soft: "rgba(238,240,244,0.88)"
		};
		/**
		* The halo behind text that sits on the picture, chosen opposite to the text so it
		* always adds contrast rather than removing it. `text-shadow` inherits, which is
		* what lets one declaration cover every run of text in an area.
		*/
		function haloFor(hex) {
			return isLightColor(hex) ? "rgba(0,0,0,0.72)" : "rgba(255,255,255,0.92)";
		}
		const EMPTY_FRAME = {
			image: "",
			key: "",
			source: "",
			back: 0,
			url: ""
		};
		/**
		* Read the stored frame synchronously, before any fetch.
		*
		* This is what makes the skin appear on the first paint instead of after a
		* round trip; the async sync then only has to notice that the host's selection
		* moved on. The clip URL comes back too, so 动态 mode can start looping the
		* same clip on that first paint rather than waiting for the fetch.
		*/
		function readStoredFrame() {
			try {
				const raw = window.localStorage.getItem(SKIN_FRAME_KEY);
				if (raw === null) return EMPTY_FRAME;
				const parsed = JSON.parse(raw);
				const dataUrl = parsed.dataUrl;
				if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) return EMPTY_FRAME;
				const id = typeof parsed.id === "string" ? parsed.id : "";
				const version = typeof parsed.version === "string" ? parsed.version : "";
				return {
					image: dataUrl,
					key: id === "" ? "" : skinKeyOf(id, version),
					source: typeof parsed.name === "string" ? parsed.name : id,
					back: typeof parsed.back === "number" && Number.isFinite(parsed.back) ? parsed.back : 0,
					url: id === "" ? "" : mediaUrlOf(id, version)
				};
			} catch {
				return EMPTY_FRAME;
			}
		}
		function writeStoredFrame(id, version, name, back, dataUrl) {
			try {
				window.localStorage.setItem(SKIN_FRAME_KEY, JSON.stringify({
					id,
					version,
					name,
					back,
					dataUrl
				}));
			} catch {}
		}
		/**
		* The media URL a stored frame came from, rebuilt from its id and content key.
		*
		* The live layer needs the URL on the FIRST paint, before any fetch, so it can
		* start looping the same clip the stored poster shows; deriving it here keeps
		* that path synchronous like the poster itself.
		*/
		function mediaUrlOf(id, version) {
			return MEDIA_URL + encodeURIComponent(id) + (version === "" ? "" : "?v=" + encodeURIComponent(version));
		}
		/** The frame bytes currently painted. */
		let skinImage = "";
		/** How far before the end the painted frame was taken, for the panel's wording. */
		let skinBack = 0;
		/** The clip URL the painted frame (and 动态 mode) belongs to. */
		let skinUrl = "";
		const storedStart = readStoredFrame();
		skinImage = storedStart.image;
		skinBack = storedStart.back;
		skinUrl = storedStart.url;
		let skinState = {
			on: readFlag(SKIN_ON_KEY) === "1",
			look: readLook(),
			scope: readScope(),
			strength: readStrength(),
			sidebar: readSidebar(),
			motion: readMotion(),
			span: readSpan(),
			textWorkspace: readTextColor(SKIN_TEXT_WORKSPACE_KEY),
			textSidebar: readTextColor(SKIN_TEXT_SIDEBAR_KEY),
			status: "idle",
			detail: "",
			source: storedStart.source,
			key: storedStart.key
		};
		const skinListeners = /* @__PURE__ */ new Set();
		function setSkinState(patch) {
			skinState = {
				...skinState,
				...patch
			};
			for (const listener of skinListeners) try {
				listener();
			} catch {}
		}
		function subscribeSkin(listener) {
			skinListeners.add(listener);
			return () => {
				skinListeners.delete(listener);
			};
		}
		function useSkinState() {
			return (0, react.useSyncExternalStore)(subscribeSkin, () => skinState);
		}
		function skinLayer() {
			const found = document.getElementById(SKIN_LAYER_ID);
			return found instanceof HTMLDivElement ? found : null;
		}
		function ensureSkinLayer() {
			if (document.body === null) return null;
			const found = skinLayer();
			if (found !== null) return found;
			const layer = document.createElement("div");
			layer.id = SKIN_LAYER_ID;
			layer.className = "dba-skin";
			layer.setAttribute("aria-hidden", "true");
			const shot = document.createElement("div");
			shot.className = "dba-skin-shot";
			layer.appendChild(shot);
			document.body.appendChild(layer);
			return layer;
		}
		function skinShot() {
			const layer = skinLayer();
			const shot = layer === null ? null : layer.firstElementChild;
			return shot instanceof HTMLDivElement ? shot : null;
		}
		/**
		* The looping clip, created lazily: 静帧 never pays for a video element at all.
		*
		* It lives INSIDE the shot, so the shot's filter, opacity and scale apply to it
		* with no extra CSS, and the shot's background-image keeps showing the tail
		* frame until the video has painted.
		*/
		function ensureSkinVideo() {
			const shot = skinShot();
			if (shot === null) return null;
			const found = shot.firstElementChild;
			if (found instanceof HTMLVideoElement) return found;
			const video = document.createElement("video");
			video.className = "dba-skin-live";
			video.muted = true;
			video.loop = true;
			video.playsInline = true;
			video.preload = "auto";
			video.setAttribute("playsinline", "");
			video.setAttribute("muted", "");
			video.setAttribute("aria-hidden", "true");
			video.addEventListener("loadedmetadata", () => {
				syncLoopMode(video);
				clampToWindow(video);
			});
			video.addEventListener("timeupdate", () => clampToWindow(video));
			video.addEventListener("playing", () => startSpanWatcher(video));
			video.addEventListener("ended", () => {
				clampToWindow(video);
				const attempt = video.play();
				if (attempt !== void 0 && typeof attempt.catch === "function") attempt.catch(() => {});
			});
			shot.appendChild(video);
			return video;
		}
		function skinVideo() {
			const shot = skinShot();
			const found = shot === null ? null : shot.firstElementChild;
			return found instanceof HTMLVideoElement ? found : null;
		}
		/**
		* The window of the clip the live mode is allowed to play, in seconds.
		*
		* `start` is where a wrap seeks back to; 0 when the whole clip is allowed (an
		* unknown duration, or a clip shorter than the requested tail, both mean "the
		* whole thing").
		*/
		function liveWindow(video) {
			const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
			const span = skinState.span;
			if (duration === 0) return {
				start: 0,
				end: 0
			};
			if (span > 0 && duration > span + .2) return {
				start: duration - span,
				end: duration
			};
			return {
				start: 0,
				end: duration
			};
		}
		/** Put playback inside the window, from whichever side it escaped. */
		function clampToWindow(video) {
			const { start, end } = liveWindow(video);
			if (end === 0) return;
			const now = video.currentTime;
			if (now < start - .08 || now > end - .05) try {
				video.currentTime = start;
			} catch {}
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
		function syncLoopMode(video) {
			video.loop = liveWindow(video).start === 0;
		}
		/**
		* Keep the player inside the tail window.
		*
		* The element keeps `loop`, so a missed wrap degrades into the clip restarting
		* rather than freezing; this guard then seeks forward into the window on the
		* next tick. requestVideoFrameCallback gives per-frame precision where it
		* exists; the timeupdate listener covers engines without it (and pauses).
		*/
		let spanWatcher = null;
		function stopSpanWatcher() {
			if (spanWatcher === null) return;
			const { video, id } = spanWatcher;
			spanWatcher = null;
			if (id === null) return;
			const withCallback = video;
			if (typeof withCallback.cancelVideoFrameCallback === "function") try {
				withCallback.cancelVideoFrameCallback(id);
			} catch {}
		}
		function startSpanWatcher(video) {
			stopSpanWatcher();
			const withCallback = video;
			const entry = {
				video,
				id: null
			};
			spanWatcher = entry;
			if (typeof withCallback.requestVideoFrameCallback !== "function") return;
			const tick = () => {
				if (spanWatcher !== entry) return;
				clampToWindow(video);
				entry.id = withCallback.requestVideoFrameCallback?.(tick) ?? null;
			};
			entry.id = withCallback.requestVideoFrameCallback(tick);
		}
		/**
		* Start, retarget or stop the live layer.
		*
		* `data-src` is the clip's content-keyed URL, so a library switch loads the new
		* clip and the browser's immutable cache makes a switch back free.
		*/
		function syncSkinVideo(active) {
			if (!active || skinState.motion !== "live" || skinUrl === "") {
				stopSpanWatcher();
				const video = skinVideo();
				if (video === null) return;
				if (!video.paused) try {
					video.pause();
				} catch {}
				if (video.dataset.src !== "") {
					video.dataset.src = "";
					video.removeAttribute("src");
					try {
						video.load();
					} catch {}
				}
				return;
			}
			const video = ensureSkinVideo();
			if (video === null) return;
			if (video.dataset.src !== skinUrl) {
				video.dataset.src = skinUrl;
				video.src = skinUrl;
				try {
					video.load();
				} catch {}
			}
			syncLoopMode(video);
			clampToWindow(video);
			if (video.paused) {
				const attempt = video.play();
				if (attempt !== void 0 && typeof attempt.then === "function") attempt.then(() => startSpanWatcher(video)).catch(() => {});
				else startSpanWatcher(video);
			} else startSpanWatcher(video);
		}
		/**
		* Publish the current state to the DOM — the only function that touches it.
		*
		* Idempotent on purpose: it is called from a store mutation, from a scheme
		* change, and from apply(), and re-running it must never stack layers.
		*/
		function paintSkin() {
			if (document.body === null) return;
			const root = document.documentElement;
			const active = skinState.on && skinImage !== "";
			root.classList.toggle("dba-skin-on", active);
			root.classList.toggle("dba-skin-window", active && skinState.scope === "window");
			root.classList.toggle("dba-skin-live-on", active && skinState.motion === "live");
			const paletteDark = document.body.hasAttribute("data-ds-dark-theme");
			const textColour = (area, scrimBase, value) => {
				root.classList.toggle("dba-text-" + area + "-on", active && value !== "");
				if (value === "") {
					root.style.removeProperty("--dba-text-" + area);
					root.style.removeProperty("--dba-" + scrimBase + "-card");
					root.style.removeProperty("--dba-" + scrimBase + "-soft");
					root.style.removeProperty("--dba-" + scrimBase + "-halo");
					root.classList.remove("dba-text-" + area + "-scrim");
					return;
				}
				root.style.setProperty("--dba-text-" + area, value);
				root.style.setProperty("--dba-" + scrimBase + "-halo", haloFor(value));
				const scrim = active && isLightColor(value) !== paletteDark;
				root.classList.toggle("dba-text-" + area + "-scrim", scrim);
				if (!scrim) {
					root.style.removeProperty("--dba-" + scrimBase + "-card");
					root.style.removeProperty("--dba-" + scrimBase + "-soft");
					return;
				}
				const colours = isLightColor(value) ? SCRIM_FOR_LIGHT_TEXT : SCRIM_FOR_DARK_TEXT;
				root.style.setProperty("--dba-" + scrimBase + "-card", colours.card);
				root.style.setProperty("--dba-" + scrimBase + "-soft", colours.soft);
			};
			textColour("ws", "ws", skinState.textWorkspace);
			textColour("side", "side", skinState.textSidebar);
			root.style.setProperty("--dba-skin-strength", String((100 - skinState.strength) / 100));
			root.style.setProperty("--dba-skin-sidebar", String(100 - skinState.sidebar) + "%");
			if (!active || ensureSkinLayer() === null) {
				syncSkinVideo(false);
				return;
			}
			const shot = skinShot();
			if (shot === null) {
				syncSkinVideo(false);
				return;
			}
			const look = LOOKS[skinState.look];
			const bright = document.body.hasAttribute("data-ds-dark-theme") ? BRIGHTNESS.dark : BRIGHTNESS.light;
			shot.style.backgroundImage = "url(\"" + skinImage + "\")";
			shot.style.filter = "blur(" + String(look.blur) + "px) brightness(" + String(bright) + ")";
			syncSkinVideo(true);
		}
		function once(video, event, timeoutMs) {
			return new Promise((resolve, reject) => {
				const timer = window.setTimeout(() => {
					cleanup();
					reject(/* @__PURE__ */ new Error("等待 " + event + " 超时"));
				}, timeoutMs);
				function cleanup() {
					window.clearTimeout(timer);
					video.removeEventListener(event, ok);
					video.removeEventListener("error", bad);
				}
				function ok() {
					cleanup();
					resolve();
				}
				function bad() {
					cleanup();
					reject(/* @__PURE__ */ new Error("视频解码失败"));
				}
				video.addEventListener(event, ok);
				video.addEventListener("error", bad);
			});
		}
		async function seekTo(video, time) {
			if (Math.abs(video.currentTime - time) < .004 && video.readyState >= 2) return;
			await new Promise((resolve, reject) => {
				const timer = window.setTimeout(() => {
					cleanup();
					reject(/* @__PURE__ */ new Error("跳转超时"));
				}, SKIN_TIMEOUT_MS);
				function cleanup() {
					window.clearTimeout(timer);
					video.removeEventListener("seeked", ok);
				}
				function ok() {
					cleanup();
					resolve();
				}
				video.addEventListener("seeked", ok);
				try {
					video.currentTime = time;
				} catch (error) {
					cleanup();
					reject(error instanceof Error ? error : new Error(String(error)));
				}
			});
		}
		/** One decoded frame past the seek, on engines that can tell us about it. */
		async function settleFrame(video) {
			const withCallback = video;
			if (typeof withCallback.requestVideoFrameCallback !== "function") return;
			await new Promise((resolve) => {
				const timer = window.setTimeout(resolve, 400);
				withCallback.requestVideoFrameCallback?.(() => {
					window.clearTimeout(timer);
					resolve();
				});
			});
		}
		/** Mean luma and spread of a frame, sampled small — enough to spot black or flat. */
		function frameStats(source) {
			const probe = document.createElement("canvas");
			probe.width = 32;
			probe.height = 18;
			const context = probe.getContext("2d");
			if (context === null) return {
				luma: 1,
				spread: 1
			};
			context.drawImage(source, 0, 0, probe.width, probe.height);
			const data = context.getImageData(0, 0, probe.width, probe.height).data;
			const lumas = [];
			let sum = 0;
			for (let i = 0; i < data.length; i += 4) {
				const luma = (.2126 * data[i] + .7152 * data[i + 1] + .0722 * data[i + 2]) / 255;
				lumas.push(luma);
				sum += luma;
			}
			const mean = sum / Math.max(1, lumas.length);
			let variance = 0;
			for (const luma of lumas) variance += (luma - mean) * (luma - mean);
			return {
				luma: mean,
				spread: Math.sqrt(variance / Math.max(1, lumas.length))
			};
		}
		/**
		* Rasterize the clip's last usable frame to a JPEG data URL.
		*
		* The element is never attached: nothing here is meant to be seen, and an
		* off-document video still decodes and still honours seeks.
		*/
		async function captureTailFrame(url) {
			const video = document.createElement("video");
			video.muted = true;
			video.playsInline = true;
			video.preload = "auto";
			video.src = url;
			try {
				await once(video, "loadedmetadata", SKIN_TIMEOUT_MS);
				if (video.readyState < 2) await once(video, "loadeddata", SKIN_TIMEOUT_MS);
				const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
				const width = video.videoWidth > 0 ? video.videoWidth : 1280;
				const height = video.videoHeight > 0 ? video.videoHeight : 720;
				const scale = Math.min(1, FRAME_MAX_EDGE / Math.max(width, height));
				const canvas = document.createElement("canvas");
				canvas.width = Math.max(2, Math.round(width * scale));
				canvas.height = Math.max(2, Math.round(height * scale));
				const context = canvas.getContext("2d");
				if (context === null) throw new Error("无法创建画布");
				const offsets = duration === 0 ? [0] : TAIL_BACKOFF_S;
				let fallback = "";
				let chosen = 0;
				for (const back of offsets) {
					await seekTo(video, duration === 0 ? 1e6 : Math.max(0, duration - back));
					await settleFrame(video);
					context.drawImage(video, 0, 0, canvas.width, canvas.height);
					fallback = canvas.toDataURL("image/jpeg", FRAME_QUALITY);
					chosen = back;
					const stats = frameStats(canvas);
					if (stats.luma >= MIN_LUMA && stats.spread >= MIN_SPREAD) {
						({ ...stats });
						return {
							dataUrl: fallback,
							back
						};
					}
					({ ...stats });
				}
				return {
					dataUrl: fallback,
					back: chosen
				};
			} finally {
				video.removeAttribute("src");
				try {
					video.load();
				} catch {}
			}
		}
		function skinKeyOf(id, version) {
			return id + "@" + (typeof version === "string" ? version : "");
		}
		function frameDetail(name, back) {
			return back > 0 ? "皮肤取自「" + name + "」的尾帧（末尾前 " + back.toFixed(2) + " 秒）" : "皮肤取自「" + name + "」的最后一帧";
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
		async function syncSkin(force) {
			if (!skinState.on) {
				paintSkin();
				return;
			}
			let list;
			try {
				list = await (await fetch(LIST_URL, { cache: "no-store" })).json();
			} catch (error) {
				setSkinState({
					status: "error",
					detail: "皮肤：读片库失败（" + String(error) + "）"
				});
				return;
			}
			const raw = list.wallpaperId ?? list.activeId;
			const rawVersion = list.wallpaperVersion ?? list.activeVersion ?? null;
			const version = typeof rawVersion === "string" && rawVersion !== "" ? rawVersion : null;
			const id = typeof raw === "string" && raw !== "" ? raw : null;
			if (id === null) {
				setSkinState({
					status: "error",
					detail: "皮肤：当前没有选中的壁纸"
				});
				return;
			}
			const name = list.videos.find((video) => video.id === id)?.name ?? id;
			const key = skinKeyOf(id, version);
			if (!force && key === skinState.key && skinImage !== "") {
				setSkinState({
					status: "ready",
					detail: frameDetail(skinState.source === "" ? name : skinState.source, skinBack)
				});
				paintSkin();
				return;
			}
			setSkinState({
				status: "working",
				detail: "皮肤：正在从「" + name + "」的尾帧生成…",
				source: name
			});
			try {
				const url = MEDIA_URL + encodeURIComponent(id) + (version === null ? "" : "?v=" + encodeURIComponent(version));
				const shot = await captureTailFrame(url);
				skinImage = shot.dataUrl;
				skinBack = shot.back;
				skinUrl = url;
				writeStoredFrame(id, version, name, shot.back, shot.dataUrl);
				setSkinState({
					status: "ready",
					detail: frameDetail(name, shot.back),
					source: name,
					key
				});
				paintSkin();
			} catch (error) {
				setSkinState({
					status: "error",
					detail: "皮肤：生成失败（" + String(error) + "）"
				});
			}
		}
		function setSkinOn(on) {
			writeFlag(SKIN_ON_KEY, on ? "1" : "0");
			setSkinState({ on });
			if (!on) {
				setSkinState({
					status: "idle",
					detail: "皮肤已关闭"
				});
				paintSkin();
				return;
			}
			paintSkin();
			syncSkin(false);
		}
		function setSkinMotion(motion) {
			writeFlag(SKIN_MOTION_KEY, motion);
			setSkinState({
				motion,
				detail: skinState.on ? motion === "live" ? "皮肤画面：动态 —— 循环播放选中那段的" + (skinState.span === 0 ? "全程" : "最后 " + String(skinState.span) + " 秒") : "皮肤画面：静帧 —— 尾帧定格，不额外开销" : skinState.detail
			});
			paintSkin();
		}
		function setSkinSpan(seconds) {
			writeFlag(SKIN_SPAN_KEY, String(seconds));
			setSkinState({
				span: seconds,
				detail: skinState.on ? "动态时长：" + (seconds === 0 ? "整段循环" : "只循环最后 " + String(seconds) + " 秒") : skinState.detail
			});
			paintSkin();
		}
		function setSkinLook(look) {
			writeFlag(SKIN_LOOK_KEY, look);
			setSkinState({
				look,
				detail: skinState.on ? "皮肤观感：" + LOOK_LABEL[look] : skinState.detail
			});
			paintSkin();
		}
		function setSkinScope(scope) {
			writeFlag(SKIN_SCOPE_KEY, scope);
			setSkinState({ scope });
			paintSkin();
		}
		function setSkinStrength(percent) {
			const strength = Math.min(100, Math.max(0, Math.round(percent)));
			writeFlag(SKIN_STRENGTH_KEY, String(strength));
			setSkinState({ strength });
			paintSkin();
		}
		function setSkinSidebar(percent) {
			const sidebar = Math.min(100, Math.max(0, Math.round(percent)));
			writeFlag(SKIN_SIDEBAR_KEY, String(sidebar));
			setSkinState({
				sidebar,
				detail: skinState.on ? sidebar === 0 ? "侧边栏透明度：0% —— 保持它自己的实底，完全挡住皮肤" : sidebar === 100 ? "侧边栏透明度：100% —— 完全透出皮肤，文字会直接压在图上" : "侧边栏透明度：" + String(sidebar) + "%" : skinState.detail
			});
			paintSkin();
		}
		/**
		* Choose the text colour that sits on the picture for one area.
		*
		* `''` clears it back to the theme's own colours. The two areas are stored and
		* applied separately because they are two different questions: the sidebar keeps
		* a fill of its own while the canvas may be at full picture strength.
		*/
		function setSkinText(role, color) {
			const key = role === "workspace" ? SKIN_TEXT_WORKSPACE_KEY : SKIN_TEXT_SIDEBAR_KEY;
			const value = /^#[0-9a-fA-F]{6}$/.test(color) ? color.toLowerCase() : "";
			try {
				if (value === "") window.localStorage.removeItem(key);
				else window.localStorage.setItem(key, value);
			} catch {}
			const patch = role === "workspace" ? { textWorkspace: value } : { textSidebar: value };
			if (skinState.on) {
				const area = role === "workspace" ? "工作区" : "侧边栏";
				patch.detail = value === "" ? "字体颜色：" + area + " 恢复主题自带" : "字体颜色：" + area + " " + value.toUpperCase();
			}
			setSkinState(patch);
			paintSkin();
		}
		/**
		* What the colour picker should show before anything is chosen: the colour the
		* area's own text has right now, so the first click starts from the truth rather
		* than from a guess about which palette is on.
		*/
		function currentTextColor(role) {
			const sel = role === "sidebar" ? "[class*=\"_sidebarCol\"]" : "[class*=\"_centerCol\"]";
			const el = document.querySelector(sel);
			const hex = (value) => {
				const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(value.trim());
				if (m === null) return "";
				return "#" + [
					m[1],
					m[2],
					m[3]
				].map((n) => Number(n).toString(16).padStart(2, "0")).join("");
			};
			const fromDom = el === null ? "" : hex(window.getComputedStyle(el).color);
			if (fromDom !== "") return fromDom;
			return document.body !== null && document.body.hasAttribute("data-ds-dark-theme") ? "#f9fafb" : "#191919";
		}
		/**
		* Repaint when the theme flips. `body[data-ds-dark-theme]` is the theme's own
		* switch, and the look's brightness has to invert with it.
		*/
		function watchScheme() {
			if (document.body === null || typeof MutationObserver !== "function") return;
			new MutationObserver(() => paintSkin()).observe(document.body, {
				attributes: true,
				attributeFilter: ["data-ds-dark-theme"]
			});
		}
		/**
		* Opens the library from outside the overlay's own React tree.
		*
		* The pin sits in a different slot than the overlay, so it cannot share React
		* state with the component that renders the dialog: they are two separate roots
		* that this plugin happens to register. A module-level listener pair is the
		* smallest honest bridge between them.
		*/
		const libraryOpeners = /* @__PURE__ */ new Set();
		function openLibrary() {
			for (const open of libraryOpeners) try {
				open();
			} catch {}
		}
		function apply(ctx) {
			const candidate = ctx.uiSession?.adapter?.current;
			const store = candidate !== void 0 && typeof candidate.getSnapshot === "function" && typeof candidate.subscribe === "function" ? candidate : null;
			ctx.uiSession;
			resolveActiveVersion();
			paintSkin();
			watchScheme();
			if (skinState.on) syncSkin(false);
			const AppRoot = () => {
				const [libOpen, setLibOpen] = (0, react.useState)(false);
				const [previewAt, setPreviewAt] = (0, react.useState)(0);
				const openSelf = (0, react.useCallback)(() => setLibOpen(true), []);
				(0, react.useEffect)(() => {
					libraryOpeners.add(openSelf);
					return () => {
						libraryOpeners.delete(openSelf);
					};
				}, [openSelf]);
				if (libOpen) return (0, react.createElement)(VideoLibrary, {
					onClose: () => setLibOpen(false),
					onPreview: () => {
						setLibOpen(false);
						setPreviewAt((n) => n + 1);
					}
				});
				return (0, react.createElement)(BootOverlay, {
					store,
					previewAt
				});
			};
			const Pin = () => (0, react.createElement)(PinAction, {
				store,
				onOpen: () => openLibrary()
			});
			const mount = () => {
				ctx.slots.inject("shell.overlay", () => ctx.slots.register({
					name: "shell.overlay",
					id: "dsh-boot-animation",
					order: 900
				}, AppRoot));
				ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({
					name: "sidebar.footer.action",
					id: "dsh-boot-animation-pin",
					order: 40,
					label: () => "片头动画"
				}, Pin));
			};
			if (typeof ctx.effect === "function") ctx.effect(mount, "dsh-boot-animation: mounts");
			else mount();
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map