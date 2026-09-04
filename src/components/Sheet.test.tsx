/** Sheet primitive (phase-11 §4): native <dialog> host + role=dialog panel,
 * initial focus, Escape / backdrop / × close paths, `open` toggling. */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { describe, expect, it, vi } from "vitest";
import { getModalHost } from "../lib/modalHost";
import { pickInitialFocus, Sheet, SHEET_EXIT_MS } from "./Sheet";

const mount = (over: Partial<React.ComponentProps<typeof Sheet>> = {}) => {
  const onRequestClose = vi.fn();
  const utils = render(
    <Sheet
      title="Data Collection"
      subtitle="Sim · APOLLO MAVIS V2 Digital Twin"
      hostTestId="host"
      testId="panel"
      closeButtonTestId="x"
      onRequestClose={onRequestClose}
      footerStart={<button data-testid="cancel">Cancel</button>}
      footer={<button data-testid="ok">Start</button>}
      {...over}
    >
      <label>
        Task <input data-testid="task" />
      </label>
    </Sheet>,
  );
  return { ...utils, onRequestClose };
};

describe("Sheet", () => {
  it("opens modally with dialog semantics and labels itself by the title", () => {
    mount();
    const host = screen.getByTestId("host") as HTMLDialogElement;
    expect(host.tagName).toBe("DIALOG");
    expect(host.open).toBe(true);
    const panel = screen.getByRole("dialog"); // the host is role=none → exactly one dialog
    expect(panel).toBe(screen.getByTestId("panel"));
    expect(panel.getAttribute("aria-modal")).toBe("true");
    const labelledBy = panel.getAttribute("aria-labelledby") ?? "";
    expect(document.getElementById(labelledBy)?.textContent).toBe("Data Collection");
    expect(screen.getByText("Sim · APOLLO MAVIS V2 Digital Twin")).toBeInTheDocument();
    expect(panel.className).toContain("sheet");
  });

  it("focuses the first body control by default, or the [data-autofocus] element", () => {
    const first = mount();
    expect(document.activeElement).toBe(screen.getByTestId("task"));
    first.unmount();
    render(
      <Sheet title="t" onRequestClose={vi.fn()} footer={<button data-autofocus>Go</button>}>
        <input data-testid="ignored" />
      </Sheet>,
    );
    expect(document.activeElement?.textContent).toBe("Go");
  });

  it("pickInitialFocus falls back body → footer → ×", () => {
    const host = document.createElement("div");
    host.innerHTML =
      '<div class="sheet-body"><span>no controls</span></div><div class="sheet-footer"><button id="f">f</button></div><button class="sheet-close" id="x">x</button>';
    expect(pickInitialFocus(host)?.id).toBe("f");
    host.querySelector("#f")?.remove();
    expect(pickInitialFocus(host)?.id).toBe("x");
  });

  it("Escape → onRequestClose('escape') instantly (data-instant), swallowing the native cancel", () => {
    const { onRequestClose } = mount();
    const host = screen.getByTestId("host");
    fireEvent.keyDown(screen.getByTestId("task"), { key: "Escape" });
    expect(onRequestClose).toHaveBeenCalledWith("escape");
    expect(host.dataset["instant"]).toBe("");
    // The browser fires `cancel` right after the keydown — must not double-report.
    fireEvent(host, new Event("cancel", { cancelable: true }));
    expect(onRequestClose).toHaveBeenCalledTimes(1);
  });

  it("a native cancel on its own reports 'escape' once; closeOnEscape=false ignores both", () => {
    const a = mount();
    fireEvent(screen.getByTestId("host"), new Event("cancel", { cancelable: true }));
    expect(a.onRequestClose).toHaveBeenCalledWith("escape");
    a.unmount();
    const b = mount({ closeOnEscape: false });
    fireEvent.keyDown(screen.getByTestId("task"), { key: "Escape" });
    fireEvent(screen.getByTestId("host"), new Event("cancel", { cancelable: true }));
    expect(b.onRequestClose).not.toHaveBeenCalled();
  });

  it("backdrop click closes; clicks inside the panel and drags that started inside do not", () => {
    const { onRequestClose } = mount();
    const host = screen.getByTestId("host");
    fireEvent.click(screen.getByRole("dialog"));
    fireEvent.click(screen.getByTestId("task"));
    expect(onRequestClose).not.toHaveBeenCalled();
    fireEvent.mouseDown(screen.getByTestId("task"));
    fireEvent.click(host); // text selection released over the scrim
    expect(onRequestClose).not.toHaveBeenCalled();
    fireEvent.mouseDown(host);
    fireEvent.click(host);
    expect(onRequestClose).toHaveBeenCalledWith("backdrop");
    fireEvent.click(host); // plain click (no mousedown record) also counts
    expect(onRequestClose).toHaveBeenCalledTimes(2);
  });

  it("closeOnBackdrop=false keeps the sheet on scrim clicks; × always reports 'close-button'", () => {
    const { onRequestClose } = mount({ closeOnBackdrop: false });
    fireEvent.click(screen.getByTestId("host"));
    expect(onRequestClose).not.toHaveBeenCalled();
    const x = screen.getByTestId("x");
    expect(x.getAttribute("aria-label")).toBe("Close");
    fireEvent.click(x);
    expect(onRequestClose).toHaveBeenCalledWith("close-button");
  });

  it("showClose=false hides ×; footer groups render start/end", () => {
    mount({ showClose: false });
    expect(screen.queryByTestId("x")).toBeNull();
    expect(screen.getByTestId("cancel").closest(".sheet-footer-start")).not.toBeNull();
    expect(screen.getByTestId("ok").closest(".sheet-footer-end")).not.toBeNull();
  });

  it("open=false closes the native dialog without reporting; unmount closes it too", () => {
    const onRequestClose = vi.fn();
    const { rerender, unmount } = render(
      <Sheet title="t" hostTestId="host" open onRequestClose={onRequestClose}>
        body
      </Sheet>,
    );
    const host = screen.getByTestId("host") as HTMLDialogElement;
    expect(host.open).toBe(true);
    rerender(
      <Sheet title="t" hostTestId="host" open={false} onRequestClose={onRequestClose}>
        body
      </Sheet>,
    );
    expect(host.open).toBe(false);
    expect(onRequestClose).not.toHaveBeenCalled();
    rerender(
      <Sheet title="t" hostTestId="host" open onRequestClose={onRequestClose}>
        body
      </Sheet>,
    );
    expect(host.open).toBe(true);
    unmount();
    expect(host.open).toBe(false);
    expect(onRequestClose).not.toHaveBeenCalled();
  });

  it("a native close event (form method=dialog) while open reports 'native'", () => {
    const { onRequestClose } = mount();
    const host = screen.getByTestId("host") as HTMLDialogElement;
    host.close();
    expect(onRequestClose).toHaveBeenCalledWith("native");
  });

  it("StrictMode remount: the Sheet's own close() event (async in browsers) never reports 'native'", async () => {
    // Real browsers queue the `close` event as a task, so the close() issued by
    // StrictMode's simulated unmount lands after the remount re-opened the
    // dialog. Emulate that dispatch order on the jsdom stub for this test.
    const proto = HTMLDialogElement.prototype;
    const syncClose = proto.close;
    proto.close = function close(this: HTMLDialogElement) {
      if (!this.open) return;
      this.removeAttribute("open");
      setTimeout(() => this.dispatchEvent(new Event("close")), 0);
    };
    try {
      const onRequestClose = vi.fn();
      render(
        <StrictMode>
          <Sheet title="t" hostTestId="host" onRequestClose={onRequestClose}>
            <input data-testid="task" />
          </Sheet>
        </StrictMode>,
      );
      const host = screen.getByTestId("host") as HTMLDialogElement;
      expect(host.open).toBe(true);
      await act(() => new Promise((r) => setTimeout(r, 10)));
      expect(host.open).toBe(true);
      expect(onRequestClose).not.toHaveBeenCalled();
      // A genuine native close afterwards is still reported.
      host.close();
      await act(() => new Promise((r) => setTimeout(r, 10)));
      expect(onRequestClose).toHaveBeenCalledWith("native");
    } finally {
      proto.close = syncClose;
    }
  });

  it("registers its host in lib/modalHost while open; unregisters on open=false and on unmount", () => {
    const { rerender, unmount } = render(
      <Sheet title="t" hostTestId="host" open onRequestClose={vi.fn()}>
        body
      </Sheet>,
    );
    const host = screen.getByTestId("host");
    expect(getModalHost()).toBe(host);
    rerender(
      <Sheet title="t" hostTestId="host" open={false} onRequestClose={vi.fn()}>
        body
      </Sheet>,
    );
    expect(getModalHost()).toBeNull();
    rerender(
      <Sheet title="t" hostTestId="host" open onRequestClose={vi.fn()}>
        body
      </Sheet>,
    );
    expect(getModalHost()).toBe(host);
    unmount();
    expect(getModalHost()).toBeNull();
    expect(SHEET_EXIT_MS).toBe(160);
  });

  it("closeOnEscape=false: Escape still marks the exit instant for the consumer's own close; a pointer press clears it", () => {
    const { onRequestClose } = mount({ closeOnEscape: false });
    const host = screen.getByTestId("host");
    fireEvent.keyDown(screen.getByTestId("task"), { key: "Escape" });
    expect(onRequestClose).not.toHaveBeenCalled();
    expect(host.dataset["instant"]).toBe("");
    fireEvent.pointerDown(screen.getByTestId("task"));
    expect(host.dataset["instant"]).toBeUndefined();
  });

  it("panelProps land on the role=dialog panel and width sets --sheet-width", () => {
    mount({ panelProps: { "data-view": "intro" }, width: 620 });
    expect(screen.getByRole("dialog").dataset["view"]).toBe("intro");
    expect(
      (screen.getByTestId("host") as HTMLElement).style.getPropertyValue("--sheet-width"),
    ).toBe("620px");
  });
});
