import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { KEYMAP } from "../../tests/mocks/fixtures";
import type { Mode } from "../lib/types";
import { KeymapOverlay } from "./KeymapOverlay";

const mount = (mode: Mode, hasRail: boolean) =>
  render(
    <KeymapOverlay
      entries={KEYMAP}
      mode={mode}
      activeArmHasRail={hasRail}
      open
      onToggle={() => undefined}
    />,
  );

describe("KeymapOverlay", () => {
  it("hides rail rows when the active arm lacks a rail", () => {
    mount("teleop", false);
    expect(screen.queryByTestId("keyrow-ArrowLeft")).toBeNull();
    expect(screen.queryByTestId("keyrow-ArrowRight")).toBeNull();
  });

  it("shows rail rows when the active arm has a rail", () => {
    mount("teleop", true);
    expect(screen.getByTestId("keyrow-ArrowLeft")).toBeInTheDocument();
    expect(screen.getByTestId("keyrow-ArrowRight")).toBeInTheDocument();
  });

  it("hides episode rows in teleop mode", () => {
    mount("teleop", true);
    expect(screen.queryByTestId("keyrow-KeyN")).toBeNull();
    expect(screen.queryByTestId("keyrow-Enter")).toBeNull();
    expect(screen.queryByTestId("keyrow-Backspace")).toBeNull();
  });

  it("shows episode rows in collect mode", () => {
    mount("collect", true);
    expect(screen.getByTestId("keyrow-KeyN")).toBeInTheDocument();
  });

  it("renders the Space row on dagger with intervention semantics", () => {
    mount("dagger", true);
    const row = screen.getByTestId("keyrow-Space");
    expect(row.textContent).toContain("recorded as intervention");
  });

  it("renders the Space row on inference with safety-escape semantics", () => {
    mount("inference", true);
    const row = screen.getByTestId("keyrow-Space");
    expect(row.textContent).toContain("safety escape — never recorded");
  });

  it("hides the Space row in teleop and collect", () => {
    mount("teleop", true);
    expect(screen.queryByTestId("keyrow-Space")).toBeNull();
  });
});
