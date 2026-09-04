/** SegmentedControl (phase-11 §4): `role="tablist"` with one sliding thumb.
 *
 * The thumb is the only animated part (`transform: translateX`, 200 ms
 * `--ease-out`, set directly on the element — no parent CSS variable).
 * Arrow/Home/End keys move the selection with automatic activation and
 * `data-instant` (0 ms) because keyboard-initiated changes never animate. */
import { useCallback, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  disabled?: boolean;
  /** Tooltip explaining a disabled segment. */
  disabledReason?: string;
  /** `data-testid` of the tab button (e.g. `kind-hardware`). */
  testId?: string;
  /** `id` of the controlled pane (`aria-controls`). */
  panelId?: string;
}

export type SegmentedOrigin = "pointer" | "keyboard";

export interface SegmentedControlProps<T extends string> {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange(value: T, origin: SegmentedOrigin): void;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  className?: string;
  testId?: string;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
  testId,
  ...aria
}: SegmentedControlProps<T>) {
  const [instant, setInstant] = useState(false);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const n = options.length;
  const index = options.findIndex((o) => o.value === value);

  const moveTo = useCallback(
    (from: number, step: number) => {
      // Next enabled option in `step` direction (wraps).
      for (let k = 1; k <= n; k += 1) {
        const i = (from + step * k + n * k) % n;
        const opt = options[i];
        if (opt && !opt.disabled) return i;
      }
      return -1;
    },
    [n, options],
  );

  const select = useCallback(
    (i: number, origin: SegmentedOrigin) => {
      const opt = options[i];
      if (!opt || opt.disabled) return;
      setInstant(origin === "keyboard");
      if (opt.value !== value) onChange(opt.value, origin);
      if (origin === "keyboard") tabRefs.current[i]?.focus();
    },
    [options, value, onChange],
  );

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    let target = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") target = moveTo(index, 1);
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") target = moveTo(index, -1);
    else if (e.key === "Home") target = moveTo(-1, 1);
    else if (e.key === "End") target = moveTo(n, -1);
    else return;
    e.preventDefault();
    if (target >= 0) select(target, "keyboard");
  };

  return (
    <div
      role="tablist"
      className={`segmented${className ? ` ${className}` : ""}`}
      data-instant={instant ? "" : undefined}
      data-testid={testId}
      onKeyDown={onKeyDown}
      {...aria}
    >
      {index >= 0 && (
        <span
          className="seg-thumb"
          aria-hidden="true"
          data-testid="seg-thumb"
          style={{
            width: `calc((100% - 4px) / ${n})`,
            transform: `translateX(${index * 100}%)`,
          }}
        />
      )}
      {options.map((opt, i) => {
        const selected = i === index;
        return (
          <button
            key={opt.value}
            ref={(el) => {
              tabRefs.current[i] = el;
            }}
            type="button"
            role="tab"
            className="seg-tab"
            aria-selected={selected}
            aria-controls={opt.panelId}
            tabIndex={selected ? 0 : -1}
            disabled={opt.disabled}
            title={opt.disabled ? opt.disabledReason : undefined}
            data-testid={opt.testId}
            data-value={opt.value}
            onClick={() => select(i, "pointer")}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
