import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REVEAL_FLAG, useRevealOnce } from "./useRevealOnce";

function Probe({ settleMs }: { settleMs?: number }) {
  const reveal = useRevealOnce(REVEAL_FLAG, settleMs);
  return <div data-testid="probe" data-reveal={reveal ? "true" : "false"} />;
}

describe("useRevealOnce", () => {
  beforeEach(() => sessionStorage.removeItem(REVEAL_FLAG));
  afterEach(() => {
    sessionStorage.removeItem(REVEAL_FLAG);
    vi.useRealTimers();
  });

  it("reveals on the first mount, sets the flag, and never again in the session", () => {
    const first = render(<Probe />);
    expect(first.getByTestId("probe").dataset["reveal"]).toBe("true");
    expect(sessionStorage.getItem(REVEAL_FLAG)).not.toBeNull();
    first.unmount();
    const second = render(<Probe />);
    expect(second.getByTestId("probe").dataset["reveal"]).toBe("false");
  });

  it("settles to false after the reveal window so later transitions carry no delay", () => {
    vi.useFakeTimers();
    const { getByTestId } = render(<Probe settleMs={500} />);
    expect(getByTestId("probe").dataset["reveal"]).toBe("true");
    act(() => {
      vi.advanceTimersByTime(499);
    });
    expect(getByTestId("probe").dataset["reveal"]).toBe("true");
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(getByTestId("probe").dataset["reveal"]).toBe("false");
  });
});
