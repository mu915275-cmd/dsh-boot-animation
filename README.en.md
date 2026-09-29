# dsh-boot-animation

A **boot animation** for DSH: when you open a new conversation — or a conversation
you pinned — a video plays full-frame in the app window. The selected clip can
also **skin the workspace** behind the canvas.

> 中文: [README.md](README.md)

> **This repository is a fork of
> [NativeDog1/dsh-boot-animation](https://github.com/NativeDog1/dsh-boot-animation)**
> (upstream is BSD-3-Clause; its `LICENSE` is kept as-is). Everything upstream does
> is still here; this fork adds the **workspace skin** — the selected clip's picture
> behind the workspace canvas, as a still or as a looping tail, with independent
> transparency for the frame and the sidebar and three blur levels. See the patch
> file at the repository root (or the git history) for the exact change list.

- Plays **once per new conversation** by default
- **Or every time** you open a conversation you pinned (one click in the sidebar footer)
- Fills the whole window, skippable, closes itself when it ends
- **Bring your own video** (three ways, below)
- **Skin the workspace** with the clip — still, or live (last 3 seconds by default)

## Install

```sh
dsh plugin --profile web add github:mu915275-cmd/dsh-boot-animation
```

> The built output (`lib/`) is committed and the package has no `prepare`
> lifecycle script, so this installs **without compiling anything** and without
> tripping pnpm's `allowBuilds` build-approval prompt.
> (Once the package is on npm, `dsh plugin --profile web add dsh-boot-animation` works too.)

Then **restart the DSH service once** — bundle layers are assembled at boot:

```sh
# stop the running `dsh web`, then
dsh web
```

### Nothing happens after installing? Do this first

DSH serves client bundles with `cache-control: max-age=31536000, immutable`, and
the `rev` in the URL is a **per-process nonce** that does not change with content.
Your browser therefore keeps the first copy it ever fetched.

Press **Ctrl+Shift+R** (hard reload) in the app window. A plain F5 is not enough.

## Usage

**New conversations** play it automatically, once each.

**Pin a conversation** to replay it on *every* open:

1. Open that conversation
2. Click the **🎞** icon at the sidebar foot (next to Settings)
3. It turns green **🎬** — pinned

Every later entry into that conversation replays the animation, including after
switching away and back, or reloading. Click again to unpin.

> If at startup your active main panel is not the conversation (e.g. some plugin's
> panel is showing), there is no current conversation yet and the pin is disabled.
> Open a conversation first.

## Built-in clips and your own video

The plugin is a **library**, not a single slot: it lists every clip it can find and
you pick what each of two things uses. The picker has **two sections**, each with
its own tick, and neither affects the other:

| Section | What it decides |
|---|---|
| **intro** (入场动画) | which clip plays full-frame on a new conversation, or on a pinned one |
| **wallpaper** (工作区壁纸) | which clip is drawn behind the workspace canvas as the skin |

The wallpaper **follows the intro** until you pick one on its own; after that the
two are independent, so changing the animation stops dragging the wallpaper with it.

**Four clips ship with it**, embedded in the code (`lib/clips.data.js`, base64 —
there are no mp4 files on disk for them):

| Name in the picker | Size |
|---|---|
| `DeepSeek 品牌片头` (brand) | 1.2 MB |
| `DeepSeek 赛博朋克片头` (cyberpunk) | 1.8 MB |
| `DeepSeek 数字角色苏醒` (awakening) | 2.5 MB |
| `DeepSeek 启动问题` (startup) | 3.2 MB |

All four are **faststart** remuxes (`moov` before `mdat`), so they play while
still downloading; the embed script refuses any input where it is not.
`media/*.mp4` is only the input to `npm run embed-clips` and is **not published**.

**Your own files still win.** The host re-resolves on every request, so swapping a
file needs no restart:

| Order | Location |
|---|---|
| 1 | the clip picked in the 🎛 library panel, **per role** (`~/.dsh/boot-animation/selection.json`: `intro` / `wallpaper`) |
| 2 | the file named by `DSH_BOOT_ANIMATION` |
| 3 | `~/.dsh/boot-animation/intro.mp4` |
| 4 | the newest file in `~/.dsh/boot-animation/videos/` |
| 5 | the four embedded clips above |

Steps 2-5 are what a role you never picked falls back to, so a profile that never
opens the picker behaves exactly as it did before the two sections existed -- and a
historical `{"id": "..."}` selection file still drives both roles at once.

## Text colour over the picture (workspace and sidebar, separately)

At a low transparency the picture is at full strength, and the theme's own text
can vanish into it -- most visibly in the light palette, where near-black text
(`#0f1115`) lands on a dark frame. The skin row therefore has one more line:

```
字体颜色：  工作区 [swatch]   侧边栏 [swatch]   默认
```

- The two swatches are independent; each is stored on its own
  (`skin-text-workspace` / `skin-text-sidebar`).
- A swatch shows the area's **current** text colour until you pick one, so you
  start from the truth rather than from a guess about the palette.
- **默认** puts both areas back on the theme's own colours.
- The workspace value covers the conversation column **and the right column** --
  the right column is only over the picture in 整个窗口 scope, so it reverts
  automatically in 仅对话区.
- The sidebar value also repaints its **icons** and the `deepseek HARNESS` wordmark.
- Both only apply while the skin is on, and switch off with it.

What gets repainted is the theme's body-text family: `--dsw-alias-label-primary`,
`-primary-dimmed`, `-secondary`, `-tertiary`, `-caption`.
(The theme has no `--dsw-alias-text-*`; that name is a common misremembering.)
Three things are deliberately left alone, because each is a semantic PAIR with a
surface this feature does not flip:

| Left alone | Why |
|---|---|
| `-primary-inverted`, `-primary-foreground` | "text on a light chip" / "text on a coloured button" — repainting them erases button labels |
| `-primary-bluish` | the text of a BLUISH pill (the 预览版 badge next to the title); its pale blue fill is an info colour and does not follow |
| coloured fills themselves (brand / info buttons, e.g. send) | their labels are the two tokens above |

### The surfaces follow the text when the two disagree

Cards carry their own fill, and that fill is paired with the PALETTE's text colour,
so white text in the light palette was white on a white card. When your colour is the
opposite polarity of the palette, the area's **neutral surfaces flip with it**:
light text makes the composer, message bubbles (where the file names are), the input
card, the chips and the sidebar's new-session button dark; dark text makes them
light. When your colour AGREES with the palette nothing moves at all, so a choice
that matches the theme changes nothing.

Flipped (with what each one paints, as measured):

| Family | Paints |
|---|---|
| `--dsw-specific-input-major` / `-minor` | the composer card |
| `--dsw-specific-bubble` | message bubbles (where the file names are) |
| `--dsw-specific-selector` | chips and the add button |
| `--dsw-alias-button-elevated-fill` | the sidebar's new-session button |
| `--dsw-alias-markdown-inline-code` | the inline-code box |
| `--dsw-alias-markdown-code-block` / `-banner` | code blocks and their banner |
| `--dsw-alias-markdown-tag` / `-placeholder` / `-citation` / `-code-segment-*` | other markdown surfaces |
| `--dsw-alias-settings-card-fill`, `-button-floating-fill`, `-bg-layer-1/2/3`, `-interactive-bg-hover-solid` | cards, floating layers, hover |
| `--dsw-specific-menu` / `--dsw-menu-surface-fill` | menus |
| `--deliverable-fill` + `[class$="_file"]`, `[class$="_deliverable"]` | the file card (see below) |

> **The file card is a special case**: its fill is a palette-scoped HARDCODED colour.
> Setting all 433 custom properties on it, and on its four ancestors, moves nothing --
> yet it is `#fafafa` in the light palette and `#212123` in the dark one -- so no token
> can hook it and it is matched by the END of its class name instead (`[class$="_file"]`;
> the hash prefix changes between builds, the suffix does not). The transcript
> separator has the opposite quirk: it paints its line from `--dsw-alias-label-caption`,
> a TEXT colour, so repainting the text turned the line white; it is pinned back to the
> halo colour.

### Text straight onto the picture gets a halo

Most text in a transcript has **no card under it** (message bodies, paths, timestamps,
chips all sit on the picture). No colour can win there: a bright clip defeats light text
and a dark one defeats dark text. So once a colour is chosen, the area's text carries a
halo of the **opposite** polarity (light text gets a dark halo and the reverse, via
`text-shadow`), which leaves the picture visible and still guarantees legibility.

The one thing still yours to weigh is the title itself: with the halo it reads over most
clips, but a colour that matches your clip (plus the transparency slider) is what makes
it comfortable.

```sh
mkdir -p ~/.dsh/boot-animation/videos
cp my-intro.mp4 ~/.dsh/boot-animation/videos/
```

Then open the **🎛** button at the sidebar foot (next to the 🎞 pin) to pick it.

Check what is in use:

```sh
curl http://127.0.0.1:3080/dsh-boot-animation/status.json
```

## Two browser policies you cannot avoid

Autoplay **with audio** and the **Fullscreen API** both require a user gesture.
So the animation starts **muted** inside a fixed full-frame overlay (already
visually fullscreen), and **one click** unmutes it *and* enters real fullscreen.
If even muted autoplay is refused, a "click to play" state is shown instead of a
black screen.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Nothing appears at all | Almost always the cache: **Ctrl+Shift+R**, or restart DSH |
| New conversation does not play | That conversation already played it (once per conversation). Pin it to replay every time |
| Pinned but still nothing | Check the pin is green, and that you opened the pinned conversation |
| Black screen | Open `/dsh-boot-animation/status.json` to see whether a source was found; check the console for a decode error |
| Want to see the decisions | Set `DEBUG = true` at the top of `src/client/index.ts`, rebuild, watch the console |

## Implementation notes

- Seats: `shell.overlay` (frame-wide floating layer, `kind: list`, additive) and
  `sidebar.footer.action` (the pin)
- The current conversation comes from `ctx.uiSession.adapter.current`, a
  React-friendly store whose snapshot is the **resolved descriptor output**
  `{ key, hooks, keyedHooks, props }` — the id is at `props.sessionId` and the
  session snapshot at `hooks.session`
- "Brand new conversation" is **`blankBit`** on that snapshot (`session.blank`
  lives on another package's projected summary, not here)
- "Every open" is implemented by watching **entry into** a conversation rather
  than remembering that it played, so a pinned conversation ignores the seen list
- The video route honours **Range** requests; browsers send them for media and
  may refuse to play when a 200 arrives where a 206 was expected

## License

BSD-3-Clause, see [LICENSE](LICENSE). The bundled `assets/boot.mp4` ships under
the same terms.
