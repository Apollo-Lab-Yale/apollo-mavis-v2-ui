/** App-level singletons wiring WS clients to the zustand store (05-ui §5). */
import type { AckMsg } from "../gen";
import { useStore } from "../store";
import { ControlClient } from "./ws/control";
import { TelemetryClient } from "./ws/telemetry";
import { getSession } from "./rest";

let heldGetter: () => ReadonlySet<string> = () => new Set();
/** TeleopSurface registers the capture hook's held ref here. */
export function setHeldSource(fn: () => ReadonlySet<string>): void {
  heldGetter = fn;
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
}

export function getControl(): ControlClient {
  if (!control) {
    control = new ControlClient({
      getHeld: () => heldGetter(),
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
