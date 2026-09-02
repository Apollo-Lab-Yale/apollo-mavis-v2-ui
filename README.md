# apollo-xarm7-ui

React 18 + Vite 5 + TypeScript (strict) SPA for the apollo-xarm7 runtime.
Talks to `apollo-xarm7-runtime` exclusively over HTTP/WebSocket on a single
origin; the UI is never in the control path.

**Target browsers**: desktop Chrome/Firefox on the operator machine
(LAN/localhost, single operator). `KeyboardEvent.code`, `createImageBitmap`,
and `OffscreenCanvas` are all Baseline there.

## Commands

```
npm install
npm run dev         # Vite dev server; proxies /api /ws /video to
                    # $APOLLO_RUNTIME_URL (default http://localhost:8765)
npm run build       # typecheck + production build → dist/
npm test            # vitest (jsdom; no runtime or hardware needed)
npm run lint        # eslint (flat config)
npm run format      # prettier
npm run gen:sync    # copy ../apollo-xarm7-core/schemas/*.json → ./schemas/
npm run gen:types   # json-schema-to-typescript → src/gen/ (checked in)
npm run gen:check   # regenerate + diff — CI guard against protocol drift
```

CI chain: `npm install && npm run lint && npm run gen:check && npm test && npm run build`.

## Routes

`#/` landing · `#/teleop` `#/collect` `#/dagger` `#/inference` (session-guarded
cockpits) · `#/devices` (gamepad + Vive-tracker debug page, no session
required; can start a fixed `teleop`/`sim`/`mavis_v2` session with arms
`grip`,`view` — gripper arm active by default). The devices page wraps its
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
`CONTROLLER_GLYPHS` in `src/input/bindings.ts` (13-tracker §1.1 mapping:
`tracker_clutch` → trigger, `gripper_close` → pad ◀, `gripper_open` → pad ▶,
`switch_arm` → pad ▲, `switch_arm_prev` → pad ▼; trackpad clicks are
classified by position at the press edge). Device-sourced discrete actions
arrive as `telemetry.tracker.device_action` (cleared by the runtime ~1 s after
firing) and render as a flash chip; `telemetry.tracker.pose_filtered` (the
One Euro-filtered pose the anchor/delta math consumes) is shown next to
`pose_world` and drives the top-down trail when present.

The tracker settings form (`yaw_deg`, `pos_scale`, `follow_rotation`, and the
pose-filter fields `filter_enabled`, `filter_min_cutoff_hz` 0.05–50,
`filter_beta` 0–5) sends one `tracker_settings` action per COMMIT (Enter or
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
