import React, { createContext, useContext, useEffect, useState } from "react";

export type WorkspaceMode = "bookstore" | "library";

interface WorkspaceContextValue {
  mode: WorkspaceMode;
  setMode: (mode: WorkspaceMode) => void;
  toggleMode: () => void;
}

const STORAGE_KEY = "colophon-workspace-mode";

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<WorkspaceMode>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "bookstore" || saved === "library") return saved;
    } catch {}
    return "bookstore";
  });

  const setMode = (newMode: WorkspaceMode) => {
    setModeState(newMode);
    try {
      localStorage.setItem(STORAGE_KEY, newMode);
    } catch {}
  };

  const toggleMode = () => {
    setMode(mode === "bookstore" ? "library" : "bookstore");
  };

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {}
  }, [mode]);

  return (
    <WorkspaceContext.Provider value={{ mode, setMode, toggleMode }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error("useWorkspace must be used within a WorkspaceProvider");
  }
  return context;
}
