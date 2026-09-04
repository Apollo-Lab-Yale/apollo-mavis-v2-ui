/** Toasts (phase-11 §4/§6): glass panel, four tones with a glyph (never
 * colour alone), explicit ×, click-anywhere dismiss. Enter 240 ms / exit
 * 160 ms as CSS transitions (`@starting-style` + `.is-leaving`), never
 * keyframes. info/success auto-dismiss after 6 s, warning after 10 s, error
 * persists; timers pause while hovered or while `document.hidden`.
 *
 * Placement: the stack is portalled into a movable `.toast-root` node that sits
 * under `<body>` — or, while a Sheet is open, under that open `<dialog>` (see
 * `lib/modalHost`). A modal dialog makes everything outside its subtree inert,
 * top-layer popovers included, so a stack rendered next to the page could not
 * be clicked (the click fell through to the dialog and closed it as a backdrop
 * dismiss). Inside the dialog it paints above the scrim and stays interactive
 * (REST 409s raised from a Sheet must remain dismissable). The node is moved
 * with `Node.moveBefore` where available so the toasts keep their state and do
 * not replay their entrance. */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useModalHost } from "../lib/modalHost";
import { useStore, type Toast } from "../store";
import { Icon, type IconName } from "./icons";

export const TOAST_DURATION_MS: Readonly<Record<Toast["tone"], number | null>> = {
  info: 6000,
  success: 6000,
  warning: 10000,
  error: null,
};
export const TOAST_EXIT_MS = 160;

const TONE_ICON: Readonly<Record<Toast["tone"], IconName>> = {
  info: "info",
  success: "check",
  warning: "warning",
  error: "error",
};

/** `Node.moveBefore` (Chrome 133+, state-preserving move); not in lib.dom yet. */
type MovableParent = Element & { moveBefore?(node: Node, child: Node | null): void };

/** Re-parent `node` under `parent`, preserving CSS/animation state when the
 * browser supports an atomic move; otherwise a plain append (re-inserted
 * children replay `@starting-style` — acceptable fallback). */
export function moveInto(parent: Element, node: Node): void {
  if (node.parentNode === parent) return;
  const p = parent as MovableParent;
  if (typeof p.moveBefore === "function" && node.isConnected && parent.isConnected) {
    try {
      p.moveBefore(node, null);
      return;
    } catch {
      /* cross-document / detached — fall through */
    }
  }
  parent.appendChild(node);
}

const createRoot = (): HTMLDivElement => {
  const el = document.createElement("div");
  el.className = "toast-root";
  return el;
};

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);
  const modalHost = useModalHost();
  const [root] = useState(createRoot);
  const [leaving, setLeaving] = useState<ReadonlySet<number>>(() => new Set());
  const [hidden, setHidden] = useState(() => typeof document !== "undefined" && document.hidden);

  useEffect(() => {
    const onVisibility = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // Live under the topmost open modal (not inert, above its scrim) or <body>.
  useLayoutEffect(() => {
    moveInto(modalHost ?? document.body, root);
  }, [modalHost, root]);
  useEffect(() => () => root.remove(), [root]);

  const requestDismiss = useCallback(
    (id: number) => {
      setLeaving((prev) => {
        if (prev.has(id)) return prev;
        const next = new Set(prev);
        next.add(id);
        return next;
      });
      window.setTimeout(() => {
        dismiss(id);
        setLeaving((prev) => {
          if (!prev.has(id)) return prev;
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }, TOAST_EXIT_MS);
    },
    [dismiss],
  );

  return createPortal(
    <div className="toasts" role="region" aria-label="Notifications" data-testid="toasts">
      {toasts.map((t) => (
        <ToastItem
          key={t.id}
          toast={t}
          paused={hidden}
          leaving={leaving.has(t.id)}
          onDismiss={requestDismiss}
        />
      ))}
    </div>,
    root,
  );
}

interface ToastItemProps {
  toast: Toast;
  paused: boolean;
  leaving: boolean;
  onDismiss(id: number): void;
}

function ToastItem({ toast, paused, leaving, onDismiss }: ToastItemProps) {
  const duration = TOAST_DURATION_MS[toast.tone];
  const [hover, setHover] = useState(false);
  const remainingRef = useRef<number | null>(duration);

  useEffect(() => {
    if (duration == null || leaving || paused || hover) return;
    const started = Date.now();
    const remaining = remainingRef.current ?? duration;
    const id = window.setTimeout(() => onDismiss(toast.id), remaining);
    return () => {
      window.clearTimeout(id);
      remainingRef.current = Math.max(0, remaining - (Date.now() - started));
    };
  }, [duration, leaving, paused, hover, onDismiss, toast.id]);

  return (
    <div
      className={`toast toast-${toast.tone}${leaving ? " is-leaving" : ""}`}
      role={toast.tone === "error" ? "alert" : "status"}
      data-testid="toast"
      data-tone={toast.tone}
      data-leaving={leaving ? "" : undefined}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => onDismiss(toast.id)}
    >
      <Icon className="toast-icon" name={TONE_ICON[toast.tone]} size={18} />
      {toast.text}
      <button
        type="button"
        className="btn-ghost btn-icon btn-sm toast-close"
        aria-label="Dismiss"
        data-testid="toast-close"
        onClick={(e) => {
          e.stopPropagation();
          onDismiss(toast.id);
        }}
      >
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}
