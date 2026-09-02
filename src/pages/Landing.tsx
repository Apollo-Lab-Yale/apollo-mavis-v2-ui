/** Landing page (05-ui §8.1): discovery, session assembly, mode launch. */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  createSession,
  getCameras,
  getKeymap,
  getPolicies,
  getProfiles,
  getScenes,
  getWorkcell,
} from "../api/rest";
import type { CameraInfo, PolicyInfo, ProfileInfo, SceneInfo, SessionSpec } from "../gen";
import { buildBindings } from "../input/bindings";
import type { FrameRef, Kind, Mode } from "../lib/types";
import { MODES } from "../lib/types";
import { useStore } from "../store";
import {
  ArmStatusCard,
  CameraPreviewGrid,
  ProfilePicker,
  ScenePicker,
  WorkcellKindToggle,
} from "../components/landing";
import { Toasts } from "../components/ConnectionBanner";

export interface LandingSelection {
  kind: Kind;
  arms: string[]; // included arm ids
  frames: Record<string, FrameRef>;
  simScene: string | null;
  twinScene: string | null;
  startFrom: "keep_current" | "profile";
  profileId: string | null;
  task: string;
  policyId: string | null;
  keymapOk: boolean;
  policiesAvailable: boolean;
}

/** Validation matrix (05-ui §8.1) — returns the blocking reason or null. */
export function validateLaunch(mode: Mode, sel: LandingSelection): string | null {
  if (!sel.keymapOk) return "Keymap unavailable — is the runtime up?";
  if (sel.arms.length === 0) return "Select at least one arm";
  for (const a of sel.arms) if (!sel.frames[a]) return `No recording frame for ${a}`;
  if (sel.kind === "sim" && !sel.simScene) return "Pick a sim scene";
  if (sel.kind === "hardware" && !sel.twinScene)
    return "Hardware sessions require a digital-twin scene";
  if (sel.startFrom === "profile" && !sel.profileId) return "Select a profile to load";
  if ((mode === "collect" || mode === "dagger") && sel.task.trim() === "")
    return "Task is required for collect/dagger";
  if ((mode === "dagger" || mode === "inference") && !sel.policiesAvailable)
    return "No policies available";
  if (mode === "inference" && !sel.policyId) return "No promoted deploy checkpoint";
  return null;
}

export function buildSpec(mode: Mode, sel: LandingSelection): SessionSpec {
  return {
    mode,
    kind: sel.kind,
    arms: sel.arms,
    frames: Object.fromEntries(sel.arms.map((a) => [a, sel.frames[a] ?? `arm_base:${a}`])),
    ...(sel.kind === "sim" ? { sim_scene: sel.simScene ?? undefined } : {}),
    ...(sel.kind === "hardware" ? { digital_twin_scene: sel.twinScene ?? undefined } : {}),
    start_from: sel.startFrom === "profile" ? `profile:${sel.profileId}` : "keep_current",
    ...(mode === "collect" || mode === "dagger" ? { task: sel.task.trim() } : {}),
    ...((mode === "dagger" || mode === "inference") && sel.policyId
      ? { policy: sel.policyId }
      : {}),
  };
}

export function Landing() {
  const navigate = useNavigate();
  const workcell = useStore((s) => s.workcell);
  const setWorkcell = useStore((s) => s.setWorkcell);
  const setKeymap = useStore((s) => s.setKeymap);
  const setSession = useStore((s) => s.setSession);
  const addToast = useStore((s) => s.addToast);

  const [kind, setKind] = useState<Kind>("sim");
  const [included, setIncluded] = useState<Record<string, boolean>>({});
  const [frames, setFrames] = useState<Record<string, FrameRef>>({});
  const [cameras, setCameras] = useState<CameraInfo[]>([]);
  const [scenes, setScenes] = useState<SceneInfo[]>([]);
  const [profiles, setProfiles] = useState<ProfileInfo[]>([]);
  const [policies, setPolicies] = useState<PolicyInfo[]>([]);
  const [sceneId, setSceneId] = useState<string | null>(null);
  const [startFrom, setStartFrom] = useState<"keep_current" | "profile">("keep_current");
  const [profileId, setProfileId] = useState<string | null>(null);
  const [task, setTask] = useState("");
  const [policyId, setPolicyId] = useState<string | null>(null);
  const [keymapOk, setKeymapOk] = useState(false);
  const [keymapTried, setKeymapTried] = useState(false);
  const [launching, setLaunching] = useState<Mode | null>(null);

  const loadKeymap = useCallback(() => {
    getKeymap()
      .then((entries) => {
        setKeymap(entries, buildBindings(entries));
        setKeymapOk(true);
        setKeymapTried(true);
      })
      .catch(() => {
        setKeymapOk(false);
        setKeymapTried(true);
      });
  }, [setKeymap]);

  useEffect(() => {
    getWorkcell()
      .then((w) => {
        setWorkcell(w);
        setKind(w.kind);
        const inc: Record<string, boolean> = {};
        const fr: Record<string, FrameRef> = {};
        for (const a of w.arms) {
          inc[a.arm_id] = true;
          fr[a.arm_id] = `arm_base:${a.arm_id}`; // default
        }
        setIncluded(inc);
        setFrames(fr);
      })
      .catch((e) => addToast(`workcell: ${e}`, "error"));
    getCameras()
      .then(setCameras)
      .catch(() => setCameras([]));
    getProfiles()
      .then(setProfiles)
      .catch(() => setProfiles([]));
    getPolicies()
      .then(setPolicies)
      .catch(() => setPolicies([]));
    loadKeymap();
  }, [setWorkcell, addToast, loadKeymap]);

  useEffect(() => {
    setSceneId(null);
    getScenes(kind === "hardware" ? "twin" : "sim")
      .then(setScenes)
      .catch(() => setScenes([]));
  }, [kind]);

  // Preselect the designated initial-condition profile when switching to "profile".
  useEffect(() => {
    if (startFrom === "profile" && profileId === null) {
      const initial = profiles.find((p) => p.is_initial_condition);
      if (initial) setProfileId(initial.profile_id);
    }
  }, [startFrom, profiles, profileId]);

  const arms = useMemo(() => workcell?.arms ?? [], [workcell]);
  const selectedArms = arms.map((a) => a.arm_id).filter((id) => included[id]);

  const promotedPolicies = useMemo(() => policies.filter((p) => p.promoted), [policies]);
  useEffect(() => {
    if (policyId === null && policies.length > 0) {
      const promoted = promotedPolicies[promotedPolicies.length - 1];
      const latest = policies[policies.length - 1];
      setPolicyId((promoted ?? latest)?.policy_id ?? null);
    }
  }, [policies, promotedPolicies, policyId]);

  const sel: LandingSelection = {
    kind,
    arms: selectedArms,
    frames,
    simScene: kind === "sim" ? sceneId : null,
    twinScene: kind === "hardware" ? sceneId : null,
    startFrom,
    profileId,
    task,
    policyId,
    keymapOk,
    policiesAvailable: workcell?.policies_available ?? false,
  };

  const launch = async (mode: Mode) => {
    setLaunching(mode);
    try {
      const info = await createSession(buildSpec(mode, sel));
      setSession(info);
      navigate(`/${mode}`);
    } catch (e) {
      addToast(`session: ${e instanceof Error ? e.message : String(e)}`, "error");
    } finally {
      setLaunching(null);
    }
  };

  return (
    <div className="landing">
      <div className="kv">
        <h1 style={{ margin: 0 }}>apollo-xarm7</h1>
        <Link to="/devices" data-testid="nav-devices" className="nav-link">
          Devices (gamepad / tracker) ▸
        </Link>
      </div>
      {workcell && (
        <WorkcellKindToggle
          kind={kind}
          available={workcell.available_kinds as Kind[]}
          onChange={setKind}
        />
      )}
      <CameraPreviewGrid cameras={cameras} />
      <div className="cards-row">
        {arms.map((a) => (
          <ArmStatusCard
            key={a.arm_id}
            arm={a}
            cameras={cameras}
            included={included[a.arm_id] ?? false}
            onIncludeChange={(v) => setIncluded((m) => ({ ...m, [a.arm_id]: v }))}
            frame={frames[a.arm_id] ?? `arm_base:${a.arm_id}`}
            onFrameChange={(f) => setFrames((m) => ({ ...m, [a.arm_id]: f }))}
          />
        ))}
      </div>
      <ScenePicker
        kind={kind === "hardware" ? "twin" : "sim"}
        scenes={scenes}
        requiredArms={selectedArms.length}
        value={sceneId}
        onChange={setSceneId}
      />
      <ProfilePicker
        profiles={profiles}
        selectedArms={selectedArms}
        startFrom={startFrom}
        onStartFromChange={(v) => setStartFrom(v)}
        value={profileId}
        onChange={setProfileId}
      />
      <div className="panel">
        <label className="kv">
          <span>Task (collect/dagger)</span>
          <input
            value={task}
            onChange={(e) => setTask(e.target.value)}
            placeholder="e.g. stack the red cube"
            data-testid="task-input"
            style={{ flex: 1 }}
          />
        </label>
        <label className="kv">
          <span>Policy (dagger/inference)</span>
          <select
            value={policyId ?? ""}
            onChange={(e) => setPolicyId(e.target.value || null)}
            data-testid="policy-select"
          >
            <option value="">— latest —</option>
            {policies.map((p) => (
              <option key={p.policy_id} value={p.policy_id}>
                {p.policy_id} (v{p.policy_version}){p.promoted ? " ★promoted" : ""}
              </option>
            ))}
          </select>
        </label>
        <div className="dim" style={{ fontSize: 12 }}>
          Inference uses promoted checkpoints only ({promotedPolicies.length} available).
        </div>
      </div>
      {keymapTried && !keymapOk && (
        <div className="banner banner-amber" data-testid="keymap-failed">
          Keymap unavailable — is the runtime up?{" "}
          <button onClick={loadKeymap} data-testid="keymap-retry">
            Retry
          </button>
        </div>
      )}
      {launching && startFrom === "profile" && (
        <div className="banner banner-amber" data-testid="profile-planning">
          Loading profile — planning safe path…
        </div>
      )}
      <div style={{ display: "flex", gap: 10 }}>
        {MODES.map((m) => {
          const reason = validateLaunch(m, sel);
          const policySel =
            m === "inference"
              ? promotedPolicies.some((p) => p.policy_id === policyId)
                ? null
                : "Inference requires a promoted checkpoint"
              : null;
          const blocked = reason ?? policySel;
          return (
            <button
              key={m}
              className="btn-primary"
              disabled={blocked !== null || launching !== null}
              title={blocked ?? undefined}
              onClick={() => void launch(m)}
              data-testid={`launch-${m}`}
            >
              {m}
            </button>
          );
        })}
      </div>
      <Toasts />
    </div>
  );
}
