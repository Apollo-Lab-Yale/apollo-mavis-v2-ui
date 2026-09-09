/** `lib/profiles` (2026-09-08): per-kind filtering (kind-less rows on both kinds),
 * the initial-condition-first order and the operator wording of a refused delete. */
import { describe, expect, it } from "vitest";
import { makeProfile } from "../../tests/mocks/fixtures";
import { ApiError } from "../api/rest";
import {
  hasInitialCondition,
  initialConditionDeleteText,
  initialConditionFirst,
  profileDeleteErrorText,
  profilesForKind,
  workcellPhrase,
} from "./profiles";

// seed_initial: ONE initial condition PER kind, both named alike.
const sim = makeProfile({
  profile_id: "s0",
  name: "default posture (2026-09-08)",
  is_initial_condition: true,
  workcell_kind: "sim",
});
const hw = makeProfile({
  profile_id: "h0",
  name: "default posture (2026-09-08)",
  is_initial_condition: true,
  workcell_kind: "hardware",
});
const simAlt = makeProfile({ profile_id: "s1", name: "grasp-ready", workcell_kind: "sim" });
// Older runtime: no `workcell_kind` at all / explicit null.
const legacy = makeProfile({ profile_id: "l0", name: "legacy", workcell_kind: undefined });
const nullKind = makeProfile({ profile_id: "n0", name: "nullkind", workcell_kind: null });

describe("hasInitialCondition", () => {
  it("counts the kind's designated row and a kind-less designated row (as the list badges it)", () => {
    expect(hasInitialCondition([sim, simAlt], "sim")).toBe(true);
    expect(hasInitialCondition([sim, simAlt], "hardware")).toBe(false);
    expect(hasInitialCondition([hw], "sim")).toBe(false);
    expect(hasInitialCondition([simAlt], "sim")).toBe(false);
    const legacyInitial = makeProfile({
      profile_id: "l1",
      name: "legacy-initial",
      is_initial_condition: true,
      workcell_kind: undefined,
    });
    expect(hasInitialCondition([legacyInitial], "sim")).toBe(true);
    expect(hasInitialCondition([legacyInitial], "hardware")).toBe(true);
    expect(hasInitialCondition([legacyInitial, hw], null)).toBe(true);
    expect(hasInitialCondition([], null)).toBe(false);
  });
});

describe("profilesForKind", () => {
  it("keeps the kind's rows plus kind-less rows, order preserved; null kind keeps every row", () => {
    const all = [hw, simAlt, legacy, sim, nullKind];
    expect(profilesForKind(all, "sim").map((p) => p.profile_id)).toEqual(["s1", "l0", "s0", "n0"]);
    expect(profilesForKind(all, "hardware").map((p) => p.profile_id)).toEqual(["h0", "l0", "n0"]);
    expect(profilesForKind(all, null).map((p) => p.profile_id)).toEqual([
      "h0",
      "s1",
      "l0",
      "s0",
      "n0",
    ]);
    expect(profilesForKind([], "sim")).toEqual([]);
  });
});

describe("initialConditionFirst", () => {
  it("moves the designated row(s) to the front and keeps the rest in order", () => {
    expect(initialConditionFirst([simAlt, legacy, sim]).map((p) => p.profile_id)).toEqual([
      "s0",
      "s1",
      "l0",
    ]);
    expect(initialConditionFirst([simAlt, legacy]).map((p) => p.profile_id)).toEqual(["s1", "l0"]);
  });
});

describe("profileDeleteErrorText", () => {
  const refused = new ApiError(
    409,
    "refusing to delete initial-condition profile 's0'; designate another profile first",
  );

  it("409 on the initial condition → the operator's words, naming the kind", () => {
    expect(profileDeleteErrorText(sim, refused)).toBe(
      "'default posture (2026-09-08)' is the initial condition of the Sim workcell — " +
        "designate another profile as the initial condition first",
    );
    expect(profileDeleteErrorText(hw, refused)).toBe(
      "'default posture (2026-09-08)' is the initial condition of the Hardware workcell — " +
        "designate another profile as the initial condition first",
    );
    expect(initialConditionDeleteText(sim)).toBe(profileDeleteErrorText(sim, refused));
  });

  it("the runtime's detail decides too (the list may be stale about the flag); a kind-less row says 'the workcell'", () => {
    expect(profileDeleteErrorText(simAlt, refused)).toBe(
      "'grasp-ready' is the initial condition of the Sim workcell — designate another profile as the initial condition first",
    );
    expect(profileDeleteErrorText({ ...legacy, is_initial_condition: true }, refused)).toBe(
      "'legacy' is the initial condition of the workcell — designate another profile as the initial condition first",
    );
    expect(workcellPhrase(null)).toBe("the workcell");
    expect(workcellPhrase("hardware")).toBe("the Hardware workcell");
  });

  it("anything else keeps the runtime text as the fallback", () => {
    expect(profileDeleteErrorText(simAlt, new ApiError(404, "unknown profile 's1'"))).toBe(
      "delete 'grasp-ready': API 404: unknown profile 's1'",
    );
    // a 409 for another reason on a row that is not the initial condition
    expect(profileDeleteErrorText(simAlt, new ApiError(409, "profile in use by a session"))).toBe(
      "delete 'grasp-ready': API 409: profile in use by a session",
    );
    expect(profileDeleteErrorText(simAlt, new Error("Failed to fetch"))).toBe(
      "delete 'grasp-ready': Failed to fetch",
    );
    expect(profileDeleteErrorText(simAlt, "boom")).toBe("delete 'grasp-ready': boom");
  });
});
