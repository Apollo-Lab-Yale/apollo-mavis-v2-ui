/** Controller link classification + the two views (13-tracker §3.5).
 *
 * The ladder is the contract: each rung is the FIRST piece of evidence an
 * operator can act on, and the additive link fields must read as UNKNOWN when a
 * runtime omits them (never as "unplugged" / "unpaired").
 */
import { render, screen } from "@testing-library/react";
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTelemetry, makeTracker } from "../../tests/mocks/fixtures";
import { useStore } from "../store";
import {
  ageText,
  controllerLink,
  ControllerLinkPanel,
  ControllerPill,
  type ControllerLinkState,
} from "./controller";

const state = (over: Parameters<typeof makeTracker>[0]): ControllerLinkState =>
  controllerLink(makeTracker(over)).state;

const real = { backend: "libsurvive" as const, dongle_present: true, objects: ["WM0"] };

beforeEach(() => {
  act(() => useStore.getState().setTelemetry(makeTelemetry()));
});

describe("controllerLink", () => {
  it("reports the first actionable link in the chain", () => {
    expect(controllerLink(null).state).toBe("no_telemetry");
    expect(state({ backend: "none", status: "no_backend" })).toBe("off");
    expect(state({ backend: "fake" })).toBe("fake");
    expect(state({ backend: "libsurvive", status: "no_backend" })).toBe("no_backend");
    expect(state({ ...real, status: "tracking" })).toBe("connected");
    // Below "tracking" the chain is ordered by what the operator can act on.
    expect(state({ ...real, dongle_present: false, status: "searching" })).toBe("no_receiver");
    expect(state({ ...real, status: "error", detail: "dongle busy" })).toBe("error");
    expect(state({ ...real, objects: [], status: "searching" })).toBe("unpaired");
    expect(state({ ...real, status: "stale", age_s: 5 })).toBe("stale");
    expect(state({ ...real, status: "searching" })).toBe("searching");
  });

  it("lets a live pose stream outrank the slower signals", () => {
    // The sysfs scan is throttled to 5 s and the object list is cleared whenever
    // the reader restarts, so neither may contradict poses that ARE arriving.
    expect(state({ ...real, status: "tracking", dongle_present: false })).toBe("connected");
    expect(state({ ...real, status: "tracking", objects: [] })).toBe("connected");
    // `stale_s` is 0.2 s in the lab config: a sub-second gap must not flip the
    // pill, a real dropout must.
    expect(state({ ...real, status: "stale", age_s: 0.3 })).toBe("connected");
    expect(state({ ...real, status: "stale", age_s: 1.4 })).toBe("stale");
  });

  it("says 'not detected' rather than 'not paired', and quotes the runtime", () => {
    // An empty object list is also how a restarting reader reads, so the label
    // never asserts a pairing fault; the runtime's detail names the causes.
    const link = controllerLink(
      makeTracker({
        ...real,
        objects: [],
        status: "searching",
        detail: "libsurvive found no tracked device (OBJECT type): dongle busy or unpaired",
      }),
    );
    expect(link.state).toBe("unpaired");
    expect(link.label).toBe("Controller not detected");
    expect(link.detail).toContain("dongle busy");
  });

  it("treats the additive fields as unknown, not as evidence", () => {
    // A runtime that predates the link fields omits them: the classification
    // must fall back to `status` and never claim "unplugged" / "not paired".
    const old = makeTracker({ backend: "libsurvive", status: "tracking" });
    expect(old.dongle_present).toBeUndefined();
    expect(old.objects).toBeUndefined();
    expect(controllerLink(old).state).toBe("connected");
    expect(state({ backend: "libsurvive", status: "searching" })).toBe("searching");
    // `null` on dongle_present is "could not check", not "absent".
    expect(state({ backend: "libsurvive", status: "tracking", dongle_present: null })).toBe(
      "connected",
    );
  });

  it("never calls a fresh pose stream healthy on the button path's behalf", () => {
    // The 2026-09-06 failure: poses at 135 Hz, no button event for minutes. The
    // pill still says connected (poses ARE arriving) but its detail sends the
    // operator to the button self-test instead of claiming everything works.
    const t = makeTracker({ ...real, status: "tracking", age_s: 0.004, controller_age_s: 700 });
    const link = controllerLink(t);
    expect(link.state).toBe("connected");
    expect(link.detail).toMatch(/trigger/i);
  });

  it("formats ages without flicker", () => {
    expect(ageText(undefined)).toBe("not reported");
    expect(ageText(null)).toBe("no event yet");
    expect(ageText(0.4)).toBe("just now");
    expect(ageText(3.6)).toBe("4 s ago");
    expect(ageText(90)).toBe("1 min ago");
    expect(ageText(7200)).toBe("2 h ago");
  });
});

describe("ControllerPill", () => {
  it("renders the state, the reason and a Set-up affordance", () => {
    const onOpen = vi.fn();
    render(
      <ControllerPill
        link={controllerLink(makeTracker({ ...real, objects: [], status: "searching" }))}
        tab="hardware"
        onOpenSetting={onOpen}
      />,
    );
    const pill = screen.getByTestId("controller-link-hardware");
    expect(pill.getAttribute("data-state")).toBe("unpaired");
    expect(pill.textContent).toBe("Controller not detected");
    expect(pill.className).toContain("pill-warn");
    screen.getByTestId("controller-setup-hardware").click();
    expect(onOpen).toHaveBeenCalledOnce();
  });
});

describe("ControllerLinkPanel", () => {
  const rows = () => ({
    receiver: screen.getByTestId("controller-row-receiver").textContent,
    pairing: screen.getByTestId("controller-row-pairing").textContent,
    pose: screen.getByTestId("controller-row-pose").textContent,
    buttons: screen.getByTestId("controller-row-buttons").textContent,
  });

  it("spells out the whole chain, receiver to buttons", () => {
    act(() =>
      useStore.getState().setTelemetry(
        makeTelemetry({
          tracker: makeTracker({
            ...real,
            status: "tracking",
            rate_hz: 135.5,
            age_s: 0.004,
            controller_age_s: 2,
            charging: false,
          }),
        }),
      ),
    );
    render(<ControllerLinkPanel />);
    const r = rows();
    expect(r.receiver).toContain("plugged in");
    expect(r.pairing).toContain("WM0");
    expect(r.pose).toContain("tracking");
    expect(r.pose).toContain("135.5 Hz");
    expect(r.buttons).toContain("last input 2 s ago");
    expect(r.buttons).toContain("the button path is alive");
    expect(screen.getByTestId("controller-row-battery").textContent).toContain("on battery");
  });

  it("asks for a trigger squeeze while no input has been seen", () => {
    act(() =>
      useStore.getState().setTelemetry(
        makeTelemetry({
          tracker: makeTracker({ ...real, status: "tracking", controller_age_s: null }),
        }),
      ),
    );
    render(<ControllerLinkPanel />);
    const buttons = screen.getByTestId("controller-row-buttons").textContent;
    expect(buttons).toContain("no event yet");
    expect(buttons).toContain("squeeze the trigger");
  });

  it("says which fields an older runtime does not report", () => {
    act(() =>
      useStore
        .getState()
        .setTelemetry(makeTelemetry({ tracker: makeTracker({ backend: "libsurvive" }) })),
    );
    render(<ControllerLinkPanel />);
    const r = rows();
    expect(r.receiver).toContain("not reported");
    expect(r.receiver).toContain("restart the runtime");
    expect(r.pairing).toContain("not reported");
    expect(r.buttons).toContain("not reported");
  });
});
