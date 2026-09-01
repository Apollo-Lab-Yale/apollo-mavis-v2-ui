import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { makeProfile } from "../../tests/mocks/fixtures";
import { ProfileActions } from "./ProfileActions";

const profiles = [
  makeProfile({ profile_id: "p0", name: "start-pose", is_initial_condition: true }),
  makeProfile({ profile_id: "p1", name: "other" }),
];

describe("ProfileActions", () => {
  it("requires confirmation before sending set_initial_condition", () => {
    const onAction = vi.fn();
    render(<ProfileActions profiles={profiles} onAction={onAction} />);
    fireEvent.click(screen.getByTestId("set-initial-open"));
    expect(onAction).not.toHaveBeenCalled(); // dialog open, nothing sent yet
    expect(screen.getByTestId("confirm-dialog").textContent).toContain("start-pose");
    fireEvent.click(screen.getByTestId("confirm-ok"));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith("set_initial_condition");
  });

  it("cancel sends nothing", () => {
    const onAction = vi.fn();
    render(<ProfileActions profiles={profiles} onAction={onAction} />);
    fireEvent.click(screen.getByTestId("set-initial-open"));
    fireEvent.click(screen.getByTestId("confirm-cancel"));
    expect(onAction).not.toHaveBeenCalled();
    expect(screen.queryByTestId("confirm-dialog")).toBeNull();
  });

  it("save profile dialog sends save_profile with name + notes", () => {
    const onAction = vi.fn();
    render(<ProfileActions profiles={profiles} onAction={onAction} />);
    fireEvent.click(screen.getByTestId("save-profile-open"));
    const save = screen.getByTestId("save-profile-confirm");
    expect(save).toBeDisabled(); // empty name blocks
    fireEvent.change(screen.getByTestId("profile-name"), { target: { value: "grasp-ready" } });
    fireEvent.change(screen.getByTestId("profile-notes"), { target: { value: "left of bin" } });
    fireEvent.click(save);
    expect(onAction).toHaveBeenCalledWith("save_profile", {
      name: "grasp-ready",
      notes: "left of bin",
    });
  });
});
