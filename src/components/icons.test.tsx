import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Icon, ICON_NAMES } from "./icons";

describe("icons", () => {
  it("every icon renders a 24-grid, 1.5 px stroke SVG, decorative by default", () => {
    for (const name of ICON_NAMES) {
      const { container, unmount } = render(<Icon name={name} size={16} />);
      const svg = container.querySelector("svg")!;
      expect(svg.getAttribute("viewBox")).toBe("0 0 24 24");
      expect(svg.getAttribute("stroke-width")).toBe("1.5");
      expect(svg.getAttribute("width")).toBe("16");
      expect(svg.getAttribute("aria-hidden")).toBe("true");
      expect(svg.dataset["icon"]).toBe(name);
      unmount();
    }
    expect(ICON_NAMES).toEqual(
      expect.arrayContaining([
        "camera",
        "camera-off",
        "mic",
        "mic-off",
        "joystick",
        "record",
        "branch",
        "play",
        "check",
        "close",
        "info",
        "chevron",
      ]),
    );
  });

  it("a title makes it a labelled image", () => {
    const { getByRole } = render(<Icon name="camera-off" title="No signal" />);
    expect(getByRole("img").textContent).toBe("No signal");
  });
});
