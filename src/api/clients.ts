/** App-level singletons wiring WS clients to the zustand store (05-ui §5). */
import type { AckMsg } from "../gen";
import { useStore } from "../store";
import { ControlClient } from "./ws/control";
import { TelemetryClient } from "./ws/telemetry";
import { getSession } from "./rest";

/** Held-code sources (keyboard capture, gamepad adapter, …) — the control
 * client sends the UNION of every registered source (13-tracker §5). */
const heldSources = new Map<string, () => ReadonlySet<string>>();

/** Register (or replace) a named held-code source; returns its unregister fn. */
export function registerHeldSource(id: string, fn: () => ReadonlySet<string>): () => void {
  heldSources.set(id, fn);
  return () => {
    if (heldSources.get(id) === fn) heldSources.delete(id);
  };
}

/** TeleopSurface registers the keyboard capture hook's held ref here. */
export function setHeldSource(fn: () => ReadonlySet<string>): void {
  registerHeldSource("keyboard", fn);
}

/** Union of all registered held sources (what every KeysMsg carries). */
export function heldUnion(): ReadonlySet<string> {
  if (heldSources.size === 1) {
    for (const fn of heldSources.values()) return fn();
  }
  const out = new Set<string>();
  for (const fn of heldSources.values()) for (const c of fn()) out.add(c);
  return out;
}

/** Capture-arming sources: the heartbeat runs while ANY source is armed. */
const armedSources = new Set<string>();

export function setArmedSource(id: string, armed: boolean): void {
  if (armed) armedSources.add(id);
  else armedSources.delete(id);
  control?.setArmed(armedSources.size > 0);
}

export function anyArmed(): boolean {
  return armedSources.size > 0;
}

type AckListener = (a: AckMsg) => void;
const ackListeners = new Set<AckListener>();
export function onAck(fn: AckListener): () => void {
  ackListeners.add(fn);
  return () => ackListeners.delete(fn);
}

let control: ControlClient | null = null;
let telemetry: TelemetryClient | null = null;

/** Hello handling: role, epoch-change reset, session resync (05-ui §5.1). */
export function handleHello(h: { epoch: string; role: "controller" | "observer" }): void {
  const st = useStore.getState();
  st.setRole(h.role);
  const known = st.session?.epoch;
  if (known && h.epoch !== known) {
    st.addToast("Runtime restarted — session lost", "error");
    st.resetForEpochChange();
    location.hash = "#/";
    return;
  }
  // Reconnect resync: re-fetch session state (mode/episode may have moved).
  void getSession()
    .then((s) => useStore.getState().setSession(s))
    .catch(() => undefined);
}

/** Test hook: drop the singletons so a fresh test can rewire factories. */
export function resetClients(): void {
  control?.close();
  control = null;
  telemetry?.close();
  telemetry = null;
  heldSources.clear();
  armedSources.clear();
}

export function getControl(): ControlClient {
  if (!control) {
    control = new ControlClient({
      getHeld: heldUnion,
      onHello: handleHello,
      onAck: (a) => {
        for (const fn of ackListeners) fn(a);
        if (!a.ok && a.detail) useStore.getState().addToast(`${a.name}: ${a.detail}`, "error");
      },
      onStatus: (s) => {
        useStore.getState().setConn("control", s);
      },
    });
    control.connect();
    if (armedSources.size > 0) control.setArmed(true);
  }
  return control;
}

export function getTelemetry(): TelemetryClient {
  if (!telemetry) {
    telemetry = new TelemetryClient({
      onTelemetry: (msg) => useStore.getState().setTelemetry(msg),
      onStatus: (s) => useStore.getState().setConn("telemetry", s),
      onStale: (stale) => useStore.getState().setTelemetryStale(stale),
    });
    telemetry.connect();
  }
  return telemetry;
}
