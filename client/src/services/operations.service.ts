export type OpsConnector = {
  key: string;
  label: string;
  route: string;
  connected: boolean;
  note: string;
};

export type OpsTask = {
  id: string;
  title: string;
  owner: string;
  done: boolean;
};

export type OperationsState = {
  connectors: OpsConnector[];
  tasks: OpsTask[];
};

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";
const STORAGE_KEY = "colophon-operations-state";

const fallbackState: OperationsState = {
  connectors: [
    {
      key: "intake",
      label: "Intake Scanner",
      route: "/intake",
      connected: true,
      note: "Scan queue and ISBN matching",
    },
    {
      key: "pos",
      label: "POS Register",
      route: "/pos-register",
      connected: true,
      note: "Checkout and cart operations",
    },
    {
      key: "sales",
      label: "Sales Pipeline",
      route: "/sales",
      connected: false,
      note: "Orders, invoices, and returns",
    },
    {
      key: "finance",
      label: "Finance Posting",
      route: "/finance",
      connected: false,
      note: "Reconcile and payables",
    },
    {
      key: "square",
      label: "Square Payments",
      route: "/operations",
      connected: false,
      note: "Hosted checkout and payment processing",
    },
  ],
  tasks: [
    { id: "OPS-100", title: "Verify scanner station calibration", owner: "Avery", done: false },
    { id: "OPS-101", title: "Map POS payment types to finance", owner: "Sarah", done: false },
    { id: "OPS-102", title: "Review rejected intake batches", owner: "Mina", done: true },
  ],
};

function readFallbackState(): OperationsState {
  if (typeof window === "undefined") {
    return fallbackState;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return fallbackState;
    }

    const parsed = JSON.parse(raw) as Partial<OperationsState>;
    if (!Array.isArray(parsed.connectors) || !Array.isArray(parsed.tasks)) {
      return fallbackState;
    }

    return {
      connectors: parsed.connectors as OpsConnector[],
      tasks: parsed.tasks as OpsTask[],
    };
  } catch {
    return fallbackState;
  }
}

function saveFallbackState(state: OperationsState): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function getOperationsState(): Promise<OperationsState> {
  try {
    return await request<OperationsState>("/api/operations/state");
  } catch {
    const state = readFallbackState();
    return state;
  }
}

export async function setConnectorConnected(key: string, connected: boolean): Promise<OpsConnector> {
  try {
    return await request<OpsConnector>(`/api/operations/connectors/${key}`, {
      method: "PATCH",
      body: JSON.stringify({ connected }),
    });
  } catch {
    const current = readFallbackState();
    const updated = current.connectors.map((item) => (item.key === key ? { ...item, connected } : item));
    const state = { ...current, connectors: updated };
    saveFallbackState(state);
    const target = updated.find((item) => item.key === key);
    if (!target) {
      throw new Error("Connector not found");
    }
    return target;
  }
}

export async function createTask(title?: string, owner?: string): Promise<OpsTask> {
  try {
    return await request<OpsTask>("/api/operations/tasks", {
      method: "POST",
      body: JSON.stringify({ title, owner }),
    });
  } catch {
    const current = readFallbackState();
    const task: OpsTask = {
      id: `OPS-${100 + current.tasks.length}`,
      title: title && title.trim().length > 0 ? title : "New operational follow-up",
      owner: owner && owner.trim().length > 0 ? owner : "Unassigned",
      done: false,
    };
    const state = { ...current, tasks: [task, ...current.tasks] };
    saveFallbackState(state);
    return task;
  }
}

export async function setTaskDone(id: string, done: boolean): Promise<OpsTask> {
  try {
    return await request<OpsTask>(`/api/operations/tasks/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ done }),
    });
  } catch {
    const current = readFallbackState();
    const updated = current.tasks.map((task) => (task.id === id ? { ...task, done } : task));
    const state = { ...current, tasks: updated };
    saveFallbackState(state);
    const target = updated.find((task) => task.id === id);
    if (!target) {
      throw new Error("Task not found");
    }
    return target;
  }
}

export async function runOperationsSyncCheck(): Promise<{ inactiveCount: number; message: string }> {
  try {
    return await request<{ inactiveCount: number; message: string }>("/api/operations/sync-check", {
      method: "POST",
    });
  } catch {
    const state = readFallbackState();
    const inactive = state.connectors.filter((item) => !item.connected).length;
    return {
      inactiveCount: inactive,
      message:
        inactive === 0
          ? "All connectors are active. Workflows are synced."
          : `${inactive} connector(s) need attention before full sync.`,
    };
  }
}
