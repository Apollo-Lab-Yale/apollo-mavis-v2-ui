/** Exit-hold hooks: a closed Sheet stays mounted for `exitMs` (fake timers). */
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useDelayedUnmount, useLingeringValue } from "./useDelayedUnmount";

const EXIT = 160;

function Flag({ open }: { open: boolean }) {
  const mounted = useDelayedUnmount(open, EXIT);
  return mounted ? <div data-testid="mounted" data-open={String(open)} /> : null;
}

function Value({ value }: { value: string | null }) {
  const shown = useLingeringValue(value, EXIT);
  return shown !== null ? <div data-testid="shown">{shown}</div> : null;
}

const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));

describe("useDelayedUnmount", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("stays mounted for exitMs after open flips to false, then unmounts", () => {
    const { rerender } = render(<Flag open />);
    expect(screen.getByTestId("mounted").dataset["open"]).toBe("true");
    rerender(<Flag open={false} />);
    expect(screen.getByTestId("mounted").dataset["open"]).toBe("false"); // exit running
    advance(EXIT - 1);
    expect(screen.getByTestId("mounted")).toBeInTheDocument();
    advance(1);
    expect(screen.queryByTestId("mounted")).toBeNull();
  });

  it("starts unmounted when initially closed; re-opening within the window cancels the unmount", () => {
    const { rerender } = render(<Flag open={false} />);
    expect(screen.queryByTestId("mounted")).toBeNull();
    rerender(<Flag open />);
    rerender(<Flag open={false} />);
    advance(EXIT / 2);
    rerender(<Flag open />);
    advance(EXIT * 2);
    expect(screen.getByTestId("mounted").dataset["open"]).toBe("true");
  });

  it("useLingeringValue keeps the last value for exitMs and follows a new value at once", () => {
    const { rerender } = render(<Value value="collect" />);
    expect(screen.getByTestId("shown").textContent).toBe("collect");
    rerender(<Value value={null} />);
    expect(screen.getByTestId("shown").textContent).toBe("collect");
    advance(EXIT - 1);
    rerender(<Value value="dagger" />); // re-opened during the exit → new value, no gap
    expect(screen.getByTestId("shown").textContent).toBe("dagger");
    advance(EXIT * 2);
    expect(screen.getByTestId("shown").textContent).toBe("dagger");
    rerender(<Value value={null} />);
    advance(EXIT);
    expect(screen.queryByTestId("shown")).toBeNull();
  });
});
