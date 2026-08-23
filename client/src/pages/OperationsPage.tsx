import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import SurfaceCard from "../components/ui/SurfaceCard";
import { getSquareConfigStatus, type SquareConfigStatus } from "../services/payment.service";
import {
  createTask,
  getOperationsState,
  runOperationsSyncCheck,
  setConnectorConnected,
  setTaskDone,
  type OpsConnector,
  type OpsTask,
} from "../services/operations.service";

type OpsTab = "workflows" | "connectors" | "tasks";

type SquareDraft = {
  environment: "sandbox" | "production";
  accessToken: string;
  locationId: string;
};

const SQUARE_DRAFT_KEY = "colophon-square-connector-draft";

function readSquareDraft(): SquareDraft {
  if (typeof window === "undefined") {
    return { environment: "sandbox", accessToken: "", locationId: "" };
  }

  try {
    const raw = window.localStorage.getItem(SQUARE_DRAFT_KEY);
    if (!raw) {
      return { environment: "sandbox", accessToken: "", locationId: "" };
    }
    const parsed = JSON.parse(raw) as Partial<SquareDraft>;
    return {
      environment: parsed.environment === "production" ? "production" : "sandbox",
      accessToken: typeof parsed.accessToken === "string" ? parsed.accessToken : "",
      locationId: typeof parsed.locationId === "string" ? parsed.locationId : "",
    };
  } catch {
    return { environment: "sandbox", accessToken: "", locationId: "" };
  }
}

function OperationsPage(): JSX.Element {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<OpsTab>("workflows");
  const [connectors, setConnectors] = useState<OpsConnector[]>([]);
  const [tasks, setTasks] = useState<OpsTask[]>([]);
  const [statusMessage, setStatusMessage] = useState("Loading operations center...");
  const [loading, setLoading] = useState(true);
  const [squareStatus, setSquareStatus] = useState<SquareConfigStatus>({
    configured: false,
    environment: "sandbox",
    missing: ["SQUARE_ACCESS_TOKEN", "SQUARE_LOCATION_ID"],
  });
  const [squareDraft, setSquareDraft] = useState<SquareDraft>(() => readSquareDraft());
  const [checkingSquare, setCheckingSquare] = useState(false);
  const [creatingLaunchChecklist, setCreatingLaunchChecklist] = useState(false);

  const launchChecklistTemplate: Array<{ title: string; owner: string }> = [
    { title: "[Pre-Launch] Connect Square credentials in server .env", owner: "Finance Lead" },
    { title: "[Pre-Launch] Validate Square sandbox checkout from POS", owner: "QA" },
    { title: "[Pre-Launch] Run end-to-end intake to finance workflow test", owner: "Operations" },
    { title: "[Pre-Launch] Verify refund and failed payment handling", owner: "POS Team" },
    { title: "[Pre-Launch] Confirm daily reporting and reconciliation", owner: "Accounting" },
  ];

  const connectedCount = useMemo(() => connectors.filter((item) => item.connected).length, [connectors]);
  const openTasks = useMemo(() => tasks.filter((item) => !item.done).length, [tasks]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const state = await getOperationsState();
        if (!mounted) {
          return;
        }
        setConnectors(state.connectors);
        setTasks(state.tasks);
        setStatusMessage("Operations center ready.");
      } catch {
        if (!mounted) {
          return;
        }
        setStatusMessage("Unable to load operations data.");
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }

      try {
        const status = await getSquareConfigStatus();
        if (mounted) {
          setSquareStatus(status);
        }
      } catch {
        if (mounted) {
          setStatusMessage("Operations loaded. Square status unavailable until API is running.");
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const toggleConnector = async (key: string, connected: boolean): Promise<void> => {
    try {
      const updated = await setConnectorConnected(key, connected);
      setConnectors((current) => current.map((item) => (item.key === key ? updated : item)));
      setStatusMessage(`${updated.label} ${updated.connected ? "connected" : "disconnected"}.`);
    } catch {
      setStatusMessage("Failed to update connector status.");
    }
  };

  const runSyncCheck = async (): Promise<void> => {
    try {
      const result = await runOperationsSyncCheck();
      setStatusMessage(result.message);
    } catch {
      setStatusMessage("Sync check failed.");
    }
  };

  const checkSquareStatus = async (): Promise<void> => {
    setCheckingSquare(true);
    try {
      const status = await getSquareConfigStatus();
      setSquareStatus(status);
      setStatusMessage(
        status.configured
          ? "Square is configured on the server."
          : `Square setup incomplete: missing ${status.missing.join(", ")}.`,
      );
    } catch {
      setStatusMessage("Could not check Square status. Make sure server API is running.");
    } finally {
      setCheckingSquare(false);
    }
  };

  const saveSquareDraft = (): void => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(SQUARE_DRAFT_KEY, JSON.stringify(squareDraft));
    }
    setStatusMessage("Square setup draft saved locally. Add values to server .env when ready.");
  };

  const addTask = async (): Promise<void> => {
    try {
      const task = await createTask();
      setTasks((current) => [task, ...current]);
      setStatusMessage(`Task ${task.id} added.`);
    } catch {
      setStatusMessage("Unable to add task.");
    }
  };

  const toggleTask = async (task: OpsTask): Promise<void> => {
    try {
      const updated = await setTaskDone(task.id, !task.done);
      setTasks((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setStatusMessage(`${updated.id} marked ${updated.done ? "done" : "open"}.`);
    } catch {
      setStatusMessage("Unable to update task.");
    }
  };

  const createLaunchChecklist = async (): Promise<void> => {
    if (creatingLaunchChecklist) {
      return;
    }

    setCreatingLaunchChecklist(true);
    try {
      const existingTitles = new Set(tasks.map((task) => task.title.toLowerCase()));
      const tasksToCreate = launchChecklistTemplate.filter((item) => !existingTitles.has(item.title.toLowerCase()));

      if (tasksToCreate.length === 0) {
        setStatusMessage("Pre-launch checklist already exists.");
        return;
      }

      const created: OpsTask[] = [];
      for (const item of tasksToCreate) {
        const task = await createTask(item.title, item.owner);
        created.push(task);
      }

      setTasks((current) => [...created, ...current]);
      setStatusMessage(`Added ${created.length} pre-launch task(s).`);
    } catch {
      setStatusMessage("Unable to create pre-launch checklist.");
    } finally {
      setCreatingLaunchChecklist(false);
    }
  };

  return (
    <section className="grid gap-4">
      <div className="rounded-full bg-white/55 p-1.5">
        <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-500">
          {([
            ["workflows", "Workflows"],
            ["connectors", "Connectors"],
            ["tasks", "Tasks"],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              className={[
                "rounded-full px-4 py-2.5",
                activeTab === key ? "bg-white text-slate-700 shadow-[0_5px_14px_rgba(76,86,103,0.12)]" : "hover:bg-white/70",
              ].join(" ")}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
        <SurfaceCard className="p-4">
          <p className="text-xs text-slate-500">Connected Modules</p>
          <p className="mt-1 text-2xl font-semibold text-slate-700">{connectedCount}/{connectors.length}</p>
        </SurfaceCard>
        <SurfaceCard className="p-4">
          <p className="text-xs text-slate-500">Open Operational Tasks</p>
          <p className="mt-1 text-2xl font-semibold text-slate-700">{openTasks}</p>
        </SurfaceCard>
        <SurfaceCard className="p-4">
          <p className="text-xs text-slate-500">Status</p>
          <p className="mt-1 text-sm font-semibold text-slate-700">{statusMessage}</p>
        </SurfaceCard>
        <SurfaceCard className="p-4">
          <p className="text-xs text-slate-500">Square Setup</p>
          <p className={[
            "mt-1 text-sm font-semibold",
            squareStatus.configured ? "text-emerald-700" : "text-amber-700",
          ].join(" ")}>
            {squareStatus.configured ? "Configured" : "Pending"}
          </p>
        </SurfaceCard>
      </div>

      {loading && (
        <SurfaceCard className="p-4">
          <p className="text-sm text-slate-500">Loading operations data...</p>
        </SurfaceCard>
      )}

      {!loading && activeTab === "workflows" && (
        <SurfaceCard className="p-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                void runSyncCheck();
              }}
              className="rounded-full bg-[#e9ff63] px-4 py-2 text-sm font-semibold text-slate-700"
            >
              Run Sync Check
            </button>
            <button
              type="button"
              onClick={() => navigate("/intake")}
              className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-600"
            >
              Open Intake Queue
            </button>
            <button
              type="button"
              onClick={() => navigate("/pos-register")}
              className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-600"
            >
              Open POS Session
            </button>
            <button
              type="button"
              onClick={() => navigate("/finance")}
              className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-600"
            >
              Open Finance Reconciliation
            </button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {connectors.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => navigate(item.route)}
                className="rounded-2xl bg-white/75 p-4 text-left hover:bg-white"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-700">{item.label}</p>
                  <span
                    className={[
                      "rounded-full px-2.5 py-1 text-xs font-semibold",
                      item.connected ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700",
                    ].join(" ")}
                  >
                    {item.connected ? "Connected" : "Not Connected"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">{item.note}</p>
              </button>
            ))}
          </div>
        </SurfaceCard>
      )}

      {!loading && activeTab === "connectors" && (
        <SurfaceCard className="p-4">
          <p className="text-sm font-semibold text-slate-700">Connector Controls</p>
          <div className="mt-3 space-y-2">
            {connectors.map((item) => (
              <div key={item.key} className="flex flex-wrap items-center gap-2 rounded-xl bg-white/70 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-700">{item.label}</p>
                  <p className="text-xs text-slate-500">{item.note}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    void toggleConnector(item.key, !item.connected);
                  }}
                  className={[
                    "rounded-full px-3 py-1 text-xs font-semibold",
                    item.connected ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700",
                  ].join(" ")}
                >
                  {item.connected ? "Disconnect" : "Connect"}
                </button>
                <button
                  type="button"
                  onClick={() => navigate(item.route)}
                  className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600"
                >
                  Go To Page
                </button>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-2xl border border-slate-100 bg-white/70 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-slate-700">Square Payments Setup</p>
              <span
                className={[
                  "rounded-full px-2.5 py-1 text-xs font-semibold",
                  squareStatus.configured ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700",
                ].join(" ")}
              >
                {squareStatus.configured ? "Configured" : "Not Configured"}
              </span>
              <button
                type="button"
                onClick={() => {
                  void checkSquareStatus();
                }}
                className="ml-auto rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600"
              >
                {checkingSquare ? "Checking..." : "Check Connection"}
              </button>
            </div>

            <p className="mt-2 text-xs text-slate-500">
              Server environment: {String(squareStatus.environment)}
              {squareStatus.configured ? "" : ` - missing ${squareStatus.missing.join(", ")}`}
            </p>

            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <label className="grid gap-1 text-xs text-slate-600">
                Environment
                <select
                  value={squareDraft.environment}
                  onChange={(event) =>
                    setSquareDraft((current) => ({
                      ...current,
                      environment: event.target.value === "production" ? "production" : "sandbox",
                    }))
                  }
                  className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700 outline-none"
                >
                  <option value="sandbox">sandbox</option>
                  <option value="production">production</option>
                </select>
              </label>

              <label className="grid gap-1 text-xs text-slate-600">
                Access Token
                <input
                  type="password"
                  value={squareDraft.accessToken}
                  onChange={(event) =>
                    setSquareDraft((current) => ({
                      ...current,
                      accessToken: event.target.value,
                    }))
                  }
                  placeholder="sq0atp-..."
                  className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700 outline-none"
                />
              </label>

              <label className="grid gap-1 text-xs text-slate-600">
                Location ID
                <input
                  value={squareDraft.locationId}
                  onChange={(event) =>
                    setSquareDraft((current) => ({
                      ...current,
                      locationId: event.target.value,
                    }))
                  }
                  placeholder="L123ABC..."
                  className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700 outline-none"
                />
              </label>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={saveSquareDraft}
                className="rounded-full bg-[#e9ff63] px-3 py-1.5 text-xs font-semibold text-slate-700"
              >
                Save Draft Locally
              </button>
              <p className="text-xs text-slate-500">When ready, copy these into server .env as SQUARE_* values.</p>
            </div>
          </div>
        </SurfaceCard>
      )}

      {!loading && activeTab === "tasks" && (
        <SurfaceCard className="p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-700">Operations Tasks</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  void createLaunchChecklist();
                }}
                className="rounded-full bg-[#e9ff63] px-3 py-1 text-xs font-semibold text-slate-700"
              >
                {creatingLaunchChecklist ? "Creating Checklist..." : "Create Pre-Launch Checklist"}
              </button>
              <button
                type="button"
                onClick={() => {
                  void addTask();
                }}
                className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600"
              >
                Add Task
              </button>
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-500">Includes Square setup and payment validation tasks before go-live.</p>
          <div className="mt-3 space-y-2">
            {tasks.map((task) => (
              <button
                key={task.id}
                type="button"
                onClick={() => {
                  void toggleTask(task);
                }}
                className={[
                  "w-full rounded-xl px-3 py-2 text-left",
                  task.done ? "bg-emerald-50" : "bg-white/80",
                ].join(" ")}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-700">{task.title}</p>
                  <span
                    className={[
                      "rounded-full px-2 py-1 text-xs font-semibold",
                      task.done ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700",
                    ].join(" ")}
                  >
                    {task.done ? "Done" : "Open"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">{task.id} - Owner: {task.owner}</p>
              </button>
            ))}
          </div>
        </SurfaceCard>
      )}
    </section>
  );
}

export default OperationsPage;
