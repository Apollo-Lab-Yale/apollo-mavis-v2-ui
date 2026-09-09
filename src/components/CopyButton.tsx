/** Copy-to-clipboard button (Online DAgger sheet): feedback lands at once — the
 * label reads "Copied" for `COPIED_MS` (1.2 s) and the glyph swaps to a check,
 * no bounce, no toast; a failed copy says "Copy failed" for the same time so the
 * operator selects the text by hand. Width is fixed by CSS so the label swap never
 * shifts the row. */
import { useEffect, useRef, useState } from "react";
import { copyText } from "../lib/clipboard";
import { Icon } from "./icons";

export const COPIED_MS = 1200;

export interface CopyButtonProps {
  text: string;
  /** Accessible name; the visible label is "Copy" / "Copied". */
  label: string;
  testId?: string;
  className?: string;
}

type CopyState = "idle" | "copied" | "failed";

export function CopyButton({ text, label, testId, className }: CopyButtonProps) {
  const [state, setState] = useState<CopyState>("idle");
  const timer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timer.current != null) window.clearTimeout(timer.current);
    },
    [],
  );
  const onClick = () => {
    void copyText(text).then((ok) => {
      setState(ok ? "copied" : "failed");
      if (timer.current != null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setState("idle"), COPIED_MS);
    });
  };
  return (
    <button
      type="button"
      className={`btn-ghost btn-sm copy-btn${className ? ` ${className}` : ""}`}
      onClick={onClick}
      aria-label={`${label}: ${state === "copied" ? "copied" : state === "failed" ? "copy failed" : "copy"}`}
      data-state={state}
      data-testid={testId}
    >
      <Icon name={state === "copied" ? "check" : "copy"} size={14} />
      <span className="copy-btn-label" aria-hidden="true">
        {state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : "Copy"}
      </span>
    </button>
  );
}
