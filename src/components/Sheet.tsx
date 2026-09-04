/** Sheet — in-page modal on the native `<dialog>` (phase-11 §4/§6).
 *
 * `showModal()` gives the focus trap, Escape, top layer and an inert page for
 * free; React owns the open state (the native `cancel`/`close` events are
 * intercepted and reported through `onRequestClose`). Structure:
 *
 *   <dialog class="sheet-host" role="none">   ← fills the viewport; backdrop-click target
 *     <div class="sheet" role="dialog" aria-modal aria-labelledby>
 *       header (title · subtitle · ×) / [headerExtra] / body / footer (start · end)
 *
 * Motion: enter 240 ms (opacity + translateY(8px) + scale(.98)) via
 * `@starting-style`; exit 160 ms (`SHEET_EXIT_MS`) when the consumer flips
 * `open` to false and keeps the Sheet mounted for that long — see
 * `useDelayedUnmount`, used by every consumer (LaunchSheet, ConfirmDialog,
 * ProfileActions, the calibration wizard). Escape closes instantly
 * (`data-instant`, set on the keydown even when the consumer owns Escape via
 * `closeOnEscape={false}`; the next pointerdown clears it). While open the host
 * is registered in `lib/modalHost` so the toast stack can live inside it (the
 * page outside a modal dialog is inert). Initial focus: `[data-autofocus]` →
 * first body control → first footer button → ×. */
import {
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type HTMLAttributes,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type SyntheticEvent,
} from "react";
import { registerModalHost, unregisterModalHost } from "../lib/modalHost";
import { Icon } from "./icons";

/** Exit transition length (matches `--dur-fast`); consumers unmount after it. */
export const SHEET_EXIT_MS = 160;

export type SheetCloseReason = "escape" | "backdrop" | "close-button" | "native";

export interface SheetProps {
  /** Header title (also the dialog's accessible name). */
  title: ReactNode;
  /** Every close path (Escape, backdrop, ×, `form method="dialog"`) lands here;
   * the consumer decides whether to unmount / flip `open`. */
  onRequestClose(reason: SheetCloseReason): void;
  /** Body content (scrolls when taller than the viewport). */
  children: ReactNode;
  /** Default true. `false` on a still-mounted Sheet runs the 160 ms exit
   * (hold it mounted with `useDelayedUnmount(open, SHEET_EXIT_MS)`). */
  open?: boolean;
  /** Context line under the title, e.g. "Sim · APOLLO MAVIS V2 Digital Twin". */
  subtitle?: ReactNode;
  /** Trailing (primary) footer actions. */
  footer?: ReactNode;
  /** Leading (secondary) footer actions. */
  footerStart?: ReactNode;
  /** Rendered between the header and the body (step bars, banners). */
  headerExtra?: ReactNode;
  /** Panel width in px (default 480; destructive confirms use 400). */
  width?: number;
  closeOnBackdrop?: boolean; // default true
  closeOnEscape?: boolean; // default true — set false to own Escape yourself
  showClose?: boolean; // default true
  /** `data-testid` of the `role="dialog"` panel. */
  testId?: string;
  /** `data-testid` of the `<dialog>` host (the backdrop-click target). */
  hostTestId?: string;
  /** `data-testid` of the × button. */
  closeButtonTestId?: string;
  /** Override `aria-labelledby` (default: the internal title element). */
  labelledBy?: string;
  className?: string;
  /** Extra attributes for the panel (e.g. `data-view`). */
  panelProps?: HTMLAttributes<HTMLDivElement> & {
    [key: `data-${string}`]: string | number | boolean | undefined;
  };
}

// Expanded per-tag (no `:is()` — jsdom's selector engine cannot parse it).
const BODY_FOCUSABLE = [
  'input:not([disabled]):not([type="hidden"])',
  "select:not([disabled])",
  "textarea:not([disabled])",
  "button:not([disabled])",
  "[href]",
  '[tabindex]:not([tabindex="-1"])',
]
  .map((sel) => `.sheet-body ${sel}`)
  .join(", ");

/** Where focus lands after `showModal()` — the consumer's `data-autofocus`
 * wins; otherwise the first body control, then the first footer button. */
export function pickInitialFocus(host: HTMLElement): HTMLElement | null {
  return (
    host.querySelector<HTMLElement>("[data-autofocus]") ??
    host.querySelector<HTMLElement>(BODY_FOCUSABLE) ??
    host.querySelector<HTMLElement>(".sheet-footer button:not([disabled])") ??
    host.querySelector<HTMLElement>(".sheet-close")
  );
}

export function Sheet({
  title,
  onRequestClose,
  children,
  open = true,
  subtitle,
  footer,
  footerStart,
  headerExtra,
  width = 480,
  closeOnBackdrop = true,
  closeOnEscape = true,
  showClose = true,
  testId,
  hostTestId,
  closeButtonTestId,
  labelledBy,
  className,
  panelProps,
}: SheetProps) {
  const hostRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  // close() calls we issued whose `close` event has not been delivered yet. The
  // event is a queued task in real browsers, so it can land after a re-open
  // (React StrictMode's simulated unmount/remount in dev) — it must never be
  // reported as a "native" close. jsdom's stub dispatches synchronously; the
  // counter handles both orders.
  const selfClosesRef = useRef(0);
  const escapeAtRef = useRef(-Infinity); // keydown handled → swallow the following `cancel`
  const mouseDownTargetRef = useRef<EventTarget | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Open / close follow the `open` prop; close() also runs on unmount while the
  // node is still connected (layout-effect cleanup) so focus restores.
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (open && !host.open) {
      previousFocusRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      delete host.dataset["instant"];
      // Mark the target with the native `autofocus` attribute so the dialog
      // focusing steps land on it directly — otherwise showModal() first
      // focuses the first focusable descendant (the × button), blurring
      // whatever was focused (spurious blur-validation on a StrictMode re-open).
      const target = pickInitialFocus(host);
      target?.setAttribute("autofocus", "");
      try {
        host.showModal();
      } catch {
        host.setAttribute("open", ""); // already open / detached — degrade to non-modal
      }
      target?.focus();
      registerModalHost(host);
    } else if (!open && host.open) {
      selfClosesRef.current += 1;
      host.close();
      unregisterModalHost(host);
    }
  }, [open]);
  useLayoutEffect(() => {
    const host = hostRef.current;
    return () => {
      if (!host) return;
      unregisterModalHost(host);
      if (host.open) {
        selfClosesRef.current += 1;
        host.close();
        const prev = previousFocusRef.current;
        if (prev && prev.isConnected && document.activeElement === document.body) prev.focus();
      }
    };
  }, []);

  const onCancel = useCallback(
    (e: SyntheticEvent<HTMLDialogElement>) => {
      e.preventDefault(); // React owns the open state
      if (!closeOnEscape) return;
      if (performance.now() - escapeAtRef.current < 100) return; // already handled on keydown
      onRequestClose("escape");
    },
    [closeOnEscape, onRequestClose],
  );
  const onClose = useCallback(() => {
    if (selfClosesRef.current > 0) {
      selfClosesRef.current -= 1; // our own close() — already accounted for
      return;
    }
    if (open) onRequestClose("native");
  }, [open, onRequestClose]);
  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDialogElement>) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      // Keyboard: no exit animation — also when the consumer owns Escape
      // (`closeOnEscape={false}`) and decides to close from its own handler.
      const host = hostRef.current;
      if (host) host.dataset["instant"] = "";
      if (!closeOnEscape) return;
      e.preventDefault(); // also suppresses the native `cancel`
      escapeAtRef.current = performance.now();
      onRequestClose("escape");
    },
    [closeOnEscape, onRequestClose],
  );
  // A pointer press after an Escape that did not close (e.g. it only dismissed an
  // inner prompt) restores the animated exit for whatever the pointer does next.
  const onPointerDown = useCallback(() => {
    const host = hostRef.current;
    if (host) delete host.dataset["instant"];
  }, []);
  const onMouseDown = useCallback((e: MouseEvent<HTMLDialogElement>) => {
    mouseDownTargetRef.current = e.target;
  }, []);
  const onClick = useCallback(
    (e: MouseEvent<HTMLDialogElement>) => {
      const down = mouseDownTargetRef.current;
      mouseDownTargetRef.current = null;
      if (e.target !== e.currentTarget) return; // inside the panel
      if (down !== null && down !== e.currentTarget) return; // drag that started inside
      if (closeOnBackdrop) onRequestClose("backdrop");
    },
    [closeOnBackdrop, onRequestClose],
  );

  const style = { "--sheet-width": `${width}px` } as CSSProperties;

  return (
    <dialog
      ref={hostRef}
      className="sheet-host"
      role="none"
      style={style}
      data-testid={hostTestId}
      onCancel={onCancel}
      onClose={onClose}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onMouseDown={onMouseDown}
      onClick={onClick}
    >
      <div
        {...panelProps}
        className={`sheet${className ? ` ${className}` : ""}${panelProps?.className ? ` ${panelProps.className}` : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy ?? titleId}
        data-testid={testId}
      >
        <header className="sheet-header">
          <div className="sheet-heading">
            <h2 id={titleId} className="sheet-title">
              {title}
            </h2>
            {subtitle != null && subtitle !== "" && (
              <div className="sheet-subtitle">{subtitle}</div>
            )}
          </div>
          {showClose && (
            <button
              type="button"
              className="btn-ghost btn-icon sheet-close"
              aria-label="Close"
              onClick={() => onRequestClose("close-button")}
              data-testid={closeButtonTestId}
            >
              <Icon name="close" size={18} />
            </button>
          )}
        </header>
        {headerExtra != null && <div className="sheet-header-extra">{headerExtra}</div>}
        <div className="sheet-body">{children}</div>
        {(footer != null || footerStart != null) && (
          <footer className="sheet-footer">
            {footerStart != null && <div className="sheet-footer-start">{footerStart}</div>}
            {footer != null && <div className="sheet-footer-end">{footer}</div>}
          </footer>
        )}
      </div>
    </dialog>
  );
}
