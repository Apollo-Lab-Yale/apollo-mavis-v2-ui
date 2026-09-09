# apollo-mavis-v2-ui

React 18 + Vite 5 + TypeScript (strict) SPA for the apollo-mavis-v2 runtime.
Talks to `apollo-mavis-v2-runtime` exclusively over HTTP/WebSocket on a single
origin; the UI is never in the control path.

**Target browsers**: desktop Chrome/Firefox on the operator machine
(LAN/localhost, single operator). `KeyboardEvent.code`, `createImageBitmap`,
and `OffscreenCanvas` are all Baseline there.

## Commands

```
npm install
npm run dev         # Vite dev server; proxies /api /ws /video to
                    # $APOLLO_RUNTIME_URL (default http://localhost:8765)
npm run build       # typecheck + production build → dist/ + scripts/check-dist.ts (no dev-proxy leak)
npm test            # vitest (jsdom; no runtime or hardware needed)
npm run lint        # eslint (flat config)
npm run format      # prettier
npm run gen:sync    # copy ../apollo-mavis-v2-core/schemas/*.json → ./schemas/
npm run gen:types   # json-schema-to-typescript → src/gen/ (checked in)
npm run gen:check   # regenerate + diff — CI guard against protocol drift
```

CI chain: `npm install && npm run lint && npm run gen:check && npm test && npm run build`.

## Routes

`#/` landing · `#/teleop` `#/collect` `#/dagger` `#/inference` (session-guarded
cockpits) · `#/devices` (gamepad + Vive-tracker debug page, no session
required; can start a fixed `teleop`/`sim`/`mavis_v2` session with arms
`grip`, `view` — the Manipulation Arm (`grip`) active by default). The devices page wraps its
video area in the same click-to-arm `TeleopSurface` as the cockpit, so keyboard
teleop (incl. the `KeyC` clutch, Tab/Z arm switch) works there too.

Gamepad input (13-tracker §5) is read in the browser (`src/input/gamepad.ts`,
50 Hz poll) and folded into the same `/ws/control` channel as the keyboard:
held rows become codes in `KeysMsg.held` (union of keyboard + gamepad),
discrete rows become `ActionMsg`. Which pad control drives which row comes
from `GET /api/keymap` (`KeymapEntry.gamepad`); the first mapped press
auto-arms capture while the control link is open and this tab is the
controller. Release-all on blur / hidden / link-down / pad loss is _latched_:
no new press edges are accepted until every mapped control reads released (or
focus + visibility return — a control still held across the latch never
re-fires by itself), so an RT held through an alt-tab cannot re-engage the
clutch or restart the heartbeat on its own. The gamepad panel shows a LATCHED
chip while the latch is engaged.

Since 2026-09-02 the lab's only input is the Vive Pro controller (13-tracker
§1.1): the runtime turns its trigger / trackpad presses into key codes itself
and echoes the raw state as `telemetry.tracker.controller` plus the injected
codes as `telemetry.tracker.device_held`. The `#/devices` tracker panel shows
them (trigger bar + pressed chip, trackpad dot with +y up, touch/click and
grip/menu/system chips, one lit action chip per injected code labelled via the
served keymap; "controller: none" when the backend reports no controller). The
gamepad panel is collapsed by default (still functional) and the keymap overlay
has a third "controller" glyph column. The served keymap has no controller
field, so the controller glyphs come from one static per-action table,
`CONTROLLER_GLYPHS` in `src/input/bindings.ts` (13-tracker §1.1 mapping — the
OPERATOR'S map, matching the runtime's `tracker.controller_map`: `tracker_clutch`
→ trigger click, `gripper_open` → pad ▲, `gripper_close` → pad ▼, `rail_neg` /
`rail_pos` → pad ◀ / ▶, `switch_arm` → menu; `switch_arm_prev` has no controller
input; trackpad clicks are classified by position at the press edge). Device-sourced discrete actions
arrive as `telemetry.tracker.device_action` (cleared by the runtime ~1 s after
firing) and render as a flash chip; `telemetry.tracker.pose_filtered` (the
One Euro-filtered pose the anchor/delta math consumes) is shown next to
`pose_world` and drives the top-down trail when present.

The tracker settings form (`yaw_deg`, `pos_scale`, `follow_rotation`, and the
pose-filter fields `filter_enabled`, `filter_min_cutoff_hz` 0.05–50,
`filter_beta` 0–200) sends one `tracker_settings` action per COMMIT (Enter or
blur; checkboxes on click), never per keystroke; out-of-range values are never
sent (the field snaps back to the echoed value). Nacks (`ok: false`) surface as
toasts and the form is disabled without a running session.

## Generated types

`src/gen/` is generated from the core JSON schemas (pydantic →
JSON Schema → TS) and checked in — **never hand-edit**. After a core protocol
change run `npm run gen:sync && npm run gen:types` and commit both `schemas/`
and `src/gen/`.

## Serving in production

`npm run build`, then point the runtime's `ui_dist` at `dist/`; the runtime
mounts it with `StaticFiles(html=True)`. Routing is hash-based (`#/teleop`
etc.) so deep links never 404 against the static mount.

## Design system (phase-11)

- `src/styles/global.css` is the single stylesheet: primitives → semantic tokens
  (`--bg --surface-1..3 --border --fg --fg-2 --fg-3 --accent --accent-fill --ok --warn
--danger …`) → component tokens; legacy names (`--panel --fg-dim --green …`) are aliases.
  Spacing `--space-1..9`, radii `--radius-1..4/pill`, shadows `--shadow-1..3` + `--edge`,
  type scale `--text-*`, motion `--dur-*` / `--ease-*` / `--stagger`. `prefers-reduced-motion`
  keeps opacity/colour and drops translate/scale; `prefers-reduced-transparency` and
  `prefers-contrast: more` are honoured.
- Inter is self-hosted (`public/fonts/InterVariable.woff2`, rsms/inter v4.1, OFL licence
  alongside); preloaded from `index.html`, `font-display: swap`, system stack fallback.
- Primitives: `Sheet` (native `<dialog>` modal), `Toasts` (four tones, auto-dismiss),
  `StreamView` (`data-state` live/connecting/stale/closed/absent), `SegmentedControl`
  (tablist + sliding thumb), `MicTile` (canvas oscillogram + level meter from
  `telemetry.microphone`), `icons.tsx` (hand-drawn inline SVG), `lib/streams.ts`
  (display names, slot orders, `MODE_LABELS`), `lib/useDocumentTitle.ts`.
- Welcome page (`src/pages/Landing.tsx`, phase-11 §4): hero + `SegmentedControl` Hardware | Sim;
  per-tab observation grid (`ObservationGrid`: Sim 2×2 from `/api/cameras`, Hardware
  `camera1`/`camera2` black when not live + `MicTile` when `/api/microphones` lists one), status
  caption (Hardware polls `GET /api/workcell?kind=hardware` every 2 s while visible), arm cards
  with a "Searching for arms…" placeholder, Start-from option rows + profile list, the read-only
  `mavis_v2` scene row, and `ModeLauncher` cards with visible disabled reasons. Teleop launches
  directly; Data Collection / Inference open `LaunchSheet` (task, promoted-only policy
  rows, Advanced → per-arm `FrameSelector`; a 409 detail shows inside the sheet); Online DAgger
  opens the two-view `OnlineDaggerSheet` (Connect a trainer: the trainer pill from the
  session-less `telemetry.external.capabilities` / `trainer_status`, Dora facts + skill
  install → Configure: session name, task, recording rows, the two Advanced gates — no
  dataset picker and no hyper-parameters: the runtime is the algorithm-agnostic shell,
  the DAgger variant lives in the trainer node; 15-online-dagger §8). The dagger Cockpit
  shows `OnlineDaggerPanel` (phase pill, trainer state + generic metrics, Take over /
  Hand back / Train now) and the `DatasetsPanel` groups Demonstrations · Online DAgger
  rollouts · Other. Pure
  `validateLaunch` / `buildSpec` / `launcherReason` live in `src/lib/launch.ts`; the first-mount
  hero reveal is gated by `lib/useRevealOnce.ts` (sessionStorage).
