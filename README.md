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
required; can start a fixed `teleop`/`sim`/`mavis_v2` session).

Gamepad input (13-tracker §5) is read in the browser (`src/input/gamepad.ts`,
50 Hz poll) and folded into the same `/ws/control` channel as the keyboard:
held rows become codes in `KeysMsg.held` (union of keyboard + gamepad),
discrete rows become `ActionMsg`. Which pad control drives which row comes
from `GET /api/keymap` (`KeymapEntry.gamepad`); the first mapped press
auto-arms capture while the control link is open and this tab is the
controller.

## Generated types

`src/gen/` is generated from the core JSON schemas (pydantic →
JSON Schema → TS) and checked in — **never hand-edit**. After a core protocol
change run `npm run gen:sync && npm run gen:types` and commit both `schemas/`
and `src/gen/`.

## Serving in production

`npm run build`, then point the runtime's `ui_dist` at `dist/`; the runtime
mounts it with `StaticFiles(html=True)`. Routing is hash-based (`#/teleop`
etc.) so deep links never 404 against the static mount.
