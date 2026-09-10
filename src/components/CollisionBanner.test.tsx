/** CollisionBanner + ClearanceReadout (05-ui §8.2; operator request
 * 2026-09-09): the readout shows the four closest pairs of the runtime's five, every
 * row is one line (pair label ellipsised with the full text in its title, chip fixed)
 * and the panel is bounded with its own scroll — the CSS rules are pinned textually
 * because jsdom lays nothing out. */
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CLEARANCE_ROWS, ClearanceReadout, CollisionBanner } from "./CollisionBanner";

const pair = (a: string, b: string, dist_m: number) => ({
  pair: [a, b] as [string, string],
  dist_m,
});
const six = [
  pair("grip_link6", "table", 0.12),
  pair("grip_right_finger_pad_2", "view_d435_mount", 0.004),
  pair("view_link4", "grip_link3", 0.031),
  pair("grip_link5", "fridge_body", 0.019),
  pair("view_link6", "range_handle", 0.08),
  pair("grip_link2", "view_link2", 0.045),
];

describe("ClearanceReadout", () => {
  it("shows the CLEARANCE_ROWS (4) closest pairs, tightest first, mm-graded", () => {
    expect(CLEARANCE_ROWS).toBe(4);
    render(<ClearanceReadout clearances={six} />);
    const panel = screen.getByTestId("clearance-readout");
    expect(panel.className).toBe("panel clearance-readout");
    expect(panel.dataset["rows"]).toBe("4");
    expect(panel.firstElementChild!.textContent).toBe("Clearances (4 closest)");
    const rows = Array.from(panel.querySelectorAll(".clearance-row"));
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.querySelector(".clearance-pair")!.textContent)).toEqual([
      "grip_right_finger_pad_2 ↔ view_d435_mount",
      "grip_link5 ↔ fridge_body",
      "view_link4 ↔ grip_link3",
      "grip_link2 ↔ view_link2",
    ]);
    expect(rows.map((r) => r.querySelector(".chip")!.textContent)).toEqual([
      "4 mm",
      "19 mm",
      "31 mm",
      "45 mm",
    ]);
    expect(rows.map((r) => r.querySelector(".chip")!.className)).toEqual([
      "chip clearance-chip chip-red",
      "chip clearance-chip chip-red",
      "chip clearance-chip chip-amber",
      "chip clearance-chip chip-amber",
    ]);
    // Every row is one line: the label carries its full text in the title (ellipsis).
    for (const r of rows) {
      const label = r.querySelector(".clearance-pair") as HTMLElement;
      expect(label.getAttribute("title")).toBe(label.textContent);
    }
  });

  it("k overrides the row count; an empty list shows a dash; a far pair is green", () => {
    const { rerender } = render(<ClearanceReadout clearances={six} k={2} />);
    expect(screen.getByTestId("clearance-readout").querySelectorAll(".clearance-row")).toHaveLength(
      2,
    );
    expect(screen.getByTestId("clearance-readout").firstElementChild!.textContent).toBe(
      "Clearances (2 closest)",
    );
    rerender(<ClearanceReadout clearances={[]} />);
    expect(screen.getByTestId("clearance-readout").textContent).toContain("—");
    rerender(<ClearanceReadout clearances={[pair("a", "b", 0.5)]} />);
    expect(screen.getByTestId("clearance-readout").querySelector(".chip")!.className).toBe(
      "chip clearance-chip chip-green",
    );
  });

  it("the stylesheet bounds the panel and keeps each row single-line", () => {
    const css = readFileSync(resolve(__dirname, "../styles/global.css"), "utf8");
    /** The FIRST declaration block of a selector (`sel {` … `}`), from `from` on. */
    const rule = (selector: string, from = 0) => {
      const start = css.indexOf(`${selector} {`, from);
      expect(start, selector).toBeGreaterThanOrEqual(0);
      return css.slice(start, css.indexOf("}", start));
    };
    expect(rule(".clearance-readout")).toMatch(/max-height:\s*9\.5rem/);
    expect(rule(".clearance-readout")).toMatch(/overflow-y:\s*auto/);
    const pairRule = rule(".clearance-pair");
    expect(pairRule).toMatch(/white-space:\s*nowrap/);
    expect(pairRule).toMatch(/overflow:\s*hidden/);
    expect(pairRule).toMatch(/text-overflow:\s*ellipsis/);
    expect(rule(".clearance-row .clearance-chip")).toMatch(/flex:\s*none/);
    // The launcher grid: four cards, two columns on a narrow window.
    expect(rule(".launcher-grid")).toMatch(/repeat\(4,\s*minmax\(0,\s*1fr\)\)/);
    const mq = css.indexOf("@media (max-width: 1000px)");
    expect(mq).toBeGreaterThanOrEqual(0);
    expect(rule(".launcher-grid", mq)).toMatch(/repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  });
});

describe("CollisionBanner", () => {
  it("nothing when ok; amber CLEARANCE LOW; red COMMAND BLOCKED with the pair", () => {
    const { container, rerender } = render(
      <CollisionBanner
        report={{ blocked: false, severity: "ok", pairs: [], min_clearance_m: 1 }}
      />,
    );
    expect(container.firstChild).toBeNull();
    rerender(
      <CollisionBanner
        report={{ blocked: false, severity: "warn", pairs: [["a", "b"]], min_clearance_m: 0.012 }}
      />,
    );
    expect(screen.getByTestId("collision-banner").className).toBe("banner banner-amber");
    expect(screen.getByTestId("collision-banner").textContent).toBe("CLEARANCE LOW a ↔ b (12 mm)");
    rerender(
      <CollisionBanner
        report={{ blocked: true, severity: "blocked", pairs: [["a", "b"]], min_clearance_m: 0.004 }}
        stale
      />,
    );
    expect(screen.getByTestId("collision-banner").className).toBe("banner banner-red");
    expect(screen.getByTestId("collision-banner").textContent).toBe(
      "COMMAND BLOCKED BY TWIN GATE — a ↔ b (stale)",
    );
  });
});
