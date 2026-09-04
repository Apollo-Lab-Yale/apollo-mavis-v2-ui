/** Toasts (phase-11 §4/§6): four tones, auto-dismiss per tone, hover and
 * document.hidden pause, explicit ×, 160 ms leave transition, and placement:
 * under <body>, or inside an open Sheet's <dialog> so it is not inert. Fake timers. */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getModalHost } from "../lib/modalHost";
import { useStore } from "../store";
import { Sheet } from "./Sheet";
import { moveInto, TOAST_DURATION_MS, TOAST_EXIT_MS, Toasts } from "./Toasts";

const add = (text: string, tone: Parameters<ReturnType<typeof useStore.getState>["addToast"]>[1]) =>
  act(() => useStore.getState().addToast(text, tone));
const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));
const setHidden = (hidden: boolean) => {
  Object.defineProperty(document, "hidden", { value: hidden, configurable: true });
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
};

describe("Toasts", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    act(() => useStore.setState({ toasts: [] }));
  });
  afterEach(() => {
    setHidden(false);
    act(() => useStore.setState({ toasts: [] }));
    vi.useRealTimers();
  });

  it("renders tone class + glyph, text as the toast's own text, and an explicit ×", () => {
    render(<Toasts />);
    add("Saved", "success");
    const toast = screen.getByText("Saved");
    expect(toast.dataset["testid"]).toBe("toast");
    expect(toast.className).toContain("toast-success");
    expect(toast.querySelector("svg[data-icon='check']")).not.toBeNull();
    expect(screen.getByTestId("toast-close").getAttribute("aria-label")).toBe("Dismiss");
    // Mounted through a movable root directly under <body> when no modal is open.
    const stack = screen.getByTestId("toasts");
    expect(stack.parentElement?.className).toBe("toast-root");
    expect(stack.parentElement?.parentElement).toBe(document.body);
    expect(stack.hasAttribute("popover")).toBe(false);
  });

  it("lives inside an open Sheet's <dialog>: × dismisses the toast and never closes the sheet", () => {
    const onRequestClose = vi.fn();
    const { rerender } = render(
      <>
        <Sheet title="Data Collection" hostTestId="host" onRequestClose={onRequestClose}>
          <input data-testid="task" />
        </Sheet>
        <Toasts />
      </>,
    );
    const host = screen.getByTestId("host") as HTMLDialogElement;
    expect(getModalHost()).toBe(host);
    add("session: a session already exists", "error");
    const stack = screen.getByTestId("toasts");
    expect(stack.closest("dialog")).toBe(host); // a descendant of the modal → not inert
    // × on the toast: handled by the toast, not read as a backdrop click.
    fireEvent.mouseDown(screen.getByTestId("toast-close"));
    fireEvent.click(screen.getByTestId("toast-close"));
    expect(onRequestClose).not.toHaveBeenCalled();
    expect(screen.getByText("session: a session already exists").className).toContain("is-leaving");
    advance(TOAST_EXIT_MS);
    expect(useStore.getState().toasts).toHaveLength(0);
    // Click-anywhere on a toast body is equally contained.
    add("again", "error");
    fireEvent.click(screen.getByText("again"));
    expect(onRequestClose).not.toHaveBeenCalled();
    expect(host.open).toBe(true);
    // Sheet closes → the stack moves back under <body>; the toast survives the move.
    rerender(
      <>
        <Sheet
          title="Data Collection"
          hostTestId="host"
          open={false}
          onRequestClose={onRequestClose}
        >
          <input data-testid="task" />
        </Sheet>
        <Toasts />
      </>,
    );
    expect(getModalHost()).toBeNull();
    expect(screen.getByTestId("toasts").closest("dialog")).toBeNull();
    expect(screen.getByTestId("toasts").parentElement?.parentElement).toBe(document.body);
    expect(screen.getByText("again")).toBeInTheDocument();
  });

  it("moveInto uses the state-preserving moveBefore when present, else appendChild", () => {
    const a = document.createElement("div");
    const b = document.createElement("div");
    const node = document.createElement("span");
    document.body.append(a, b);
    moveInto(a, node); // detached → appendChild
    expect(node.parentNode).toBe(a);
    const moveBefore = vi.fn((n: Node) => b.appendChild(n));
    Object.assign(b, { moveBefore });
    moveInto(b, node);
    expect(moveBefore).toHaveBeenCalledWith(node, null);
    expect(node.parentNode).toBe(b);
    moveInto(b, node); // already there → no-op
    expect(moveBefore).toHaveBeenCalledTimes(1);
    a.remove();
    b.remove();
  });

  it("info/success auto-dismiss after 6 s, warning after 10 s, error persists", () => {
    render(<Toasts />);
    add("i", "info");
    add("s", "success");
    add("w", "warning");
    add("e", "error");
    expect(TOAST_DURATION_MS.error).toBeNull();
    advance(TOAST_DURATION_MS.info! - 1);
    expect(screen.getAllByTestId("toast").length).toBe(4);
    advance(1); // info + success start leaving
    expect(screen.getByText("i").className).toContain("is-leaving");
    expect(screen.getByText("s").className).toContain("is-leaving");
    expect(useStore.getState().toasts.length).toBe(4); // still in the store during the exit
    advance(TOAST_EXIT_MS);
    expect(useStore.getState().toasts.map((t) => t.text)).toEqual(["w", "e"]);
    advance(TOAST_DURATION_MS.warning! - TOAST_DURATION_MS.info! - TOAST_EXIT_MS + TOAST_EXIT_MS);
    expect(useStore.getState().toasts.map((t) => t.text)).toEqual(["e"]);
    advance(60_000);
    expect(useStore.getState().toasts.map((t) => t.text)).toEqual(["e"]);
    expect(screen.getByText("e").getAttribute("role")).toBe("alert");
  });

  it("hover pauses the timer and resumes with the remaining time", () => {
    render(<Toasts />);
    add("hover me", "info");
    advance(5000);
    const toast = screen.getByText("hover me");
    fireEvent.mouseEnter(toast);
    advance(20_000);
    expect(useStore.getState().toasts.length).toBe(1);
    expect(toast.className).not.toContain("is-leaving");
    fireEvent.mouseLeave(toast);
    advance(999);
    expect(toast.className).not.toContain("is-leaving");
    advance(1 + TOAST_EXIT_MS);
    expect(useStore.getState().toasts.length).toBe(0);
  });

  it("document.hidden pauses every timer", () => {
    render(<Toasts />);
    add("bg", "info");
    setHidden(true);
    advance(30_000);
    expect(useStore.getState().toasts.length).toBe(1);
    setHidden(false);
    advance(TOAST_DURATION_MS.info! + TOAST_EXIT_MS);
    expect(useStore.getState().toasts.length).toBe(0);
  });

  it("× and click-anywhere dismiss (leave class, then removal after 160 ms)", () => {
    render(<Toasts />);
    add("a", "error");
    add("b", "error");
    fireEvent.click(screen.getAllByTestId("toast-close")[0]!);
    expect(screen.getByText("a").className).toContain("is-leaving");
    fireEvent.click(screen.getByText("a")); // double dismiss is harmless
    advance(TOAST_EXIT_MS);
    expect(useStore.getState().toasts.map((t) => t.text)).toEqual(["b"]);
    fireEvent.click(screen.getByText("b"));
    advance(TOAST_EXIT_MS);
    expect(useStore.getState().toasts.length).toBe(0);
    expect(screen.queryAllByTestId("toast").length).toBe(0);
  });
});
