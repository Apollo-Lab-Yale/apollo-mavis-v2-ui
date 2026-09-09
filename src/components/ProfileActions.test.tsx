/** ProfileActions (05-ui §8.3): ONE save button since 2026-09-07 — the old
 * "set current state as initial condition" button is gone and its designation
 * rides `save_profile`'s `set_initial` switch, so there is exactly one snapshot
 * and one name however the operator uses it. 2026-09-08 adds **Go to profile**:
 * a select of THIS kind's profiles (initial condition first, kind-less rows
 * included) and a button that sends `goto_profile {profile_id}` — exact args,
 * the disabled reasons, and the ack / nack toasts (fed through `handleAck`, the
 * same fan-out the ControlClient uses, so the generic nack toast is exercised). */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeProfile } from "../../tests/mocks/fixtures";
import { handleAck } from "../api/clients";
import { useStore } from "../store";
import { GOTO_HINT, ProfileActions } from "./ProfileActions";

const profiles = [
  makeProfile({ profile_id: "p0", name: "start-pose", is_initial_condition: true }),
  makeProfile({ profile_id: "p1", name: "other" }),
];
// The other kind's rows, with ITS initial condition (seed_initial makes one per kind).
const hwProfiles = [
  makeProfile({ profile_id: "h1", name: "hw-alt", workcell_kind: "hardware" }),
  makeProfile({
    profile_id: "h0",
    name: "hw-start",
    is_initial_condition: true,
    workcell_kind: "hardware",
  }),
];
// Older runtime: no `workcell_kind` → listed for either kind.
const legacy = makeProfile({ profile_id: "l0", name: "legacy", workcell_kind: undefined });

const select = () => screen.getByTestId("goto-profile-select") as HTMLSelectElement;
const options = () => [...select().options].map((o) => [o.value, o.text]);

describe("ProfileActions", () => {
  afterEach(() => useStore.setState({ toasts: [] }));

  it("save + go-to are the panel's two buttons; there is no separate initial-condition button", () => {
    render(<ProfileActions profiles={profiles} kind="sim" onAction={vi.fn()} />);
    expect(screen.queryByTestId("set-initial-open")).toBeNull();
    const buttons = screen.getByTestId("profile-actions").querySelectorAll("button");
    expect([...buttons].map((b) => b.dataset["testid"])).toEqual([
      "save-profile-open",
      "goto-profile",
    ]);
  });

  it("sends save_profile with name + notes and set_initial false by default", () => {
    const onAction = vi.fn();
    render(<ProfileActions profiles={profiles} kind="sim" onAction={onAction} />);
    fireEvent.click(screen.getByTestId("save-profile-open"));
    const save = screen.getByTestId("save-profile-confirm");
    expect(save).toBeDisabled(); // empty name blocks
    fireEvent.change(screen.getByTestId("profile-name"), { target: { value: "grasp-ready" } });
    fireEvent.change(screen.getByTestId("profile-notes"), { target: { value: "left of bin" } });
    fireEvent.click(save);
    expect(onAction).toHaveBeenCalledWith("save_profile", {
      name: "grasp-ready",
      notes: "left of bin",
      set_initial: false,
    });
  });

  it("the switch carries the initial-condition designation in the same action", () => {
    const onAction = vi.fn();
    render(<ProfileActions profiles={profiles} kind="sim" onAction={onAction} />);
    fireEvent.click(screen.getByTestId("save-profile-open"));
    fireEvent.change(screen.getByTestId("profile-name"), { target: { value: " home " } });
    fireEvent.click(screen.getByTestId("profile-set-initial"));
    // The dialog names the profile whose designation would move.
    expect(screen.getByTestId("save-profile-dialog").textContent).toContain("start-pose");
    fireEvent.click(screen.getByTestId("save-profile-confirm"));
    expect(onAction).toHaveBeenCalledTimes(1); // one op, not a chained pair
    expect(onAction).toHaveBeenCalledWith("save_profile", {
      name: "home", // trimmed
      notes: "",
      set_initial: true,
    });
  });

  it("cancel sends nothing, and re-opening starts from a clean form", async () => {
    const onAction = vi.fn();
    render(<ProfileActions profiles={profiles} kind="sim" onAction={onAction} />);
    fireEvent.click(screen.getByTestId("save-profile-open"));
    fireEvent.change(screen.getByTestId("profile-name"), { target: { value: "scratch" } });
    fireEvent.click(screen.getByTestId("profile-set-initial"));
    fireEvent.click(screen.getByTestId("save-profile-cancel"));
    expect(onAction).not.toHaveBeenCalled();
    expect((screen.getByTestId("save-profile-dialog") as HTMLDialogElement).open).toBe(false);
    await waitFor(() => expect(screen.queryByTestId("save-profile-dialog")).toBeNull());

    fireEvent.click(screen.getByTestId("save-profile-open"));
    expect((screen.getByTestId("profile-name") as HTMLInputElement).value).toBe("");
    expect((screen.getByTestId("profile-set-initial") as HTMLInputElement).checked).toBe(false);
    expect(screen.getByTestId("save-profile-confirm")).toBeDisabled();
  });

  // -- Go to profile (2026-09-08) -------------------------------------------------------
  it("lists this kind's profiles, initial condition first, kind-less rows included; the other kind is hidden", () => {
    const { rerender } = render(
      <ProfileActions
        profiles={[...profiles, ...hwProfiles, legacy]}
        kind="hardware"
        onAction={vi.fn()}
      />,
    );
    expect(options()).toEqual([
      ["h0", "hw-start · initial condition"],
      ["h1", "hw-alt"],
      ["l0", "legacy"],
    ]);
    expect(select().value).toBe("h0"); // the initial condition is the default target
    // The save sheet's designation line names THIS kind's initial condition.
    fireEvent.click(screen.getByTestId("save-profile-open"));
    fireEvent.click(screen.getByTestId("profile-set-initial"));
    const dialog = screen.getByTestId("save-profile-dialog").textContent ?? "";
    expect(dialog).toContain("hw-start");
    expect(dialog).not.toContain("start-pose");

    rerender(
      <ProfileActions
        profiles={[...profiles, ...hwProfiles, legacy]}
        kind="sim"
        onAction={vi.fn()}
      />,
    );
    expect(options()).toEqual([
      ["p0", "start-pose · initial condition"],
      ["p1", "other"],
      ["l0", "legacy"],
    ]);
    // Unknown kind (older runtime): every row.
    rerender(
      <ProfileActions
        profiles={[...profiles, ...hwProfiles, legacy]}
        kind={null}
        onAction={vi.fn()}
      />,
    );
    expect(options().map((o) => o[0])).toEqual(["p0", "h0", "p1", "h1", "l0"]);
  });

  it("sends goto_profile with EXACTLY {profile_id} for the chosen row (default: the initial condition)", () => {
    const onAction = vi.fn();
    render(<ProfileActions profiles={profiles} kind="sim" onAction={onAction} />);
    expect(screen.getByTestId("goto-profile")).toBeEnabled();
    expect(screen.getByTestId("goto-profile-hint").textContent).toBe(GOTO_HINT);
    expect(screen.queryByTestId("goto-profile-reason")).toBeNull();
    fireEvent.click(screen.getByTestId("goto-profile"));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith("goto_profile", { profile_id: "p0" });
    // `GotoProfileArgs` is extra="forbid": nothing but profile_id may ride along.
    expect(Object.keys(onAction.mock.calls[0]![1] as object)).toEqual(["profile_id"]);

    fireEvent.change(select(), { target: { value: "p1" } });
    fireEvent.click(screen.getByTestId("goto-profile"));
    expect(onAction).toHaveBeenLastCalledWith("goto_profile", { profile_id: "p1" });
    expect(onAction).toHaveBeenCalledTimes(2);
  });

  it("disabled WITH the reason: the page's gate, or no profile of this kind; a stale choice falls back", () => {
    const onAction = vi.fn();
    const { rerender } = render(
      <ProfileActions
        profiles={profiles}
        kind="sim"
        gotoReason="Save or discard the episode first"
        onAction={onAction}
      />,
    );
    const btn = screen.getByTestId("goto-profile");
    expect(btn).toBeDisabled();
    const reason = screen.getByTestId("goto-profile-reason");
    expect(reason.textContent).toBe("Save or discard the episode first");
    expect(btn.getAttribute("aria-describedby")).toBe(reason.id);
    expect(screen.queryByTestId("goto-profile-hint")).toBeNull();
    fireEvent.click(btn);
    expect(onAction).not.toHaveBeenCalled();

    rerender(
      <ProfileActions
        profiles={profiles}
        kind="sim"
        gotoReason="Control link down"
        onAction={onAction}
      />,
    );
    expect(screen.getByTestId("goto-profile-reason").textContent).toBe("Control link down");

    // No profile of this kind: the select is empty and disabled, the button says why.
    rerender(<ProfileActions profiles={profiles} kind="hardware" onAction={onAction} />);
    expect(select()).toBeDisabled();
    expect(options()).toEqual([]);
    expect(screen.getByTestId("goto-profile")).toBeDisabled();
    expect(screen.getByTestId("goto-profile-reason").textContent).toBe(
      "No saved Hardware profiles — save one first",
    );
    rerender(<ProfileActions profiles={[]} kind={null} onAction={onAction} />);
    expect(screen.getByTestId("goto-profile-reason").textContent).toBe(
      "No saved profiles — save one first",
    );

    // Back on Sim: live again. Pick `other`, then have it deleted → the target falls
    // back to the first row (the initial condition) instead of sending a dead id.
    rerender(<ProfileActions profiles={profiles} kind="sim" onAction={onAction} />);
    expect(screen.getByTestId("goto-profile")).toBeEnabled();
    fireEvent.change(select(), { target: { value: "p1" } });
    expect(select().value).toBe("p1");
    rerender(<ProfileActions profiles={[profiles[0]!]} kind="sim" onAction={onAction} />);
    expect(select().value).toBe("p0");
    fireEvent.click(screen.getByTestId("goto-profile"));
    expect(onAction).toHaveBeenLastCalledWith("goto_profile", { profile_id: "p0" });
  });

  it("toasts the ack: ok → the runtime's detail (fallback names the profile); nack → the reason, generic toast suppressed", () => {
    render(<ProfileActions profiles={profiles} kind="sim" onAction={vi.fn()} />);
    const toasts = () => useStore.getState().toasts;

    fireEvent.click(screen.getByTestId("goto-profile"));
    handleAck({
      t: "ack",
      name: "goto_profile",
      ok: true,
      detail: "going to 'start-pose' (14 waypoints)",
    });
    expect(toasts()).toHaveLength(1);
    expect(toasts()[0]).toMatchObject({
      text: "going to 'start-pose' (14 waypoints)",
      tone: "info",
    });

    // An ok ack without detail names what was asked for.
    fireEvent.change(select(), { target: { value: "p1" } });
    fireEvent.click(screen.getByTestId("goto-profile"));
    handleAck({ t: "ack", name: "goto_profile", ok: true, detail: "" });
    expect(toasts()[1]).toMatchObject({ text: "Going to 'other'", tone: "info" });

    // A nack: the panel's own toast, NOT the generic "goto_profile: …" error one.
    fireEvent.click(screen.getByTestId("goto-profile"));
    handleAck({ t: "ack", name: "goto_profile", ok: false, detail: "an episode is recording" });
    expect(toasts()).toHaveLength(3);
    expect(toasts()[2]).toMatchObject({
      text: "Go to profile refused: an episode is recording",
      tone: "warning",
    });
    expect(toasts().some((t) => t.text.startsWith("goto_profile:"))).toBe(false);

    // Other actions' nacks are not this panel's business: the generic toast stands.
    handleAck({ t: "ack", name: "save_profile", ok: false, detail: "name taken" });
    expect(toasts()[3]).toMatchObject({ text: "save_profile: name taken", tone: "error" });
  });
});
