/** Degraded-state banners: control link down / observer / telemetry stale (05-ui §10). */
import { useStore } from "../store";

export function ConnectionBanner() {
  const control = useStore((s) => s.conn.control);
  const role = useStore((s) => s.conn.role);
  const telemetryStale = useStore((s) => s.telemetryStale);
  const telemetry = useStore((s) => s.telemetry);
  const disconnectedArms = telemetry?.arms.filter((a) => !a.connected) ?? [];

  return (
    <>
      {control !== "open" && (
        <div className="banner banner-red" data-testid="control-link-down">
          CONTROL LINK DOWN
        </div>
      )}
      {role === "observer" && (
        <div className="banner banner-amber" data-testid="observer-banner">
          Another tab holds control — read-only
        </div>
      )}
      {telemetryStale && (
        <div className="banner banner-amber" data-testid="telemetry-stale">
          TELEMETRY STALE
        </div>
      )}
      {disconnectedArms.map((a) => (
        <div className="banner banner-red" key={a.arm_id} data-testid={`arm-down-${a.arm_id}`}>
          {a.arm_id} DISCONNECTED — motion held
        </div>
      ))}
    </>
  );
}

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast${t.tone === "error" ? " toast-error" : ""}`}
          onClick={() => dismiss(t.id)}
          data-testid="toast"
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
