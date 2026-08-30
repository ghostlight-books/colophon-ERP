import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import {
  fetchLibrarySpaces,
  createLibrarySpace,
  updateLibrarySpace,
  deleteLibrarySpace,
  type LibrarySpace,
} from "../services/library.service";

interface LibrarySpaceContextType {
  spaces: LibrarySpace[];
  activeSpace: LibrarySpace | null;
  activeSpaceId: string;
  loading: boolean;
  setActiveSpaceId: (id: string) => void;
  refreshSpaces: () => Promise<void>;
  createSpace: (data: {
    name: string;
    description?: string | null;
    location?: string | null;
    icon?: string | null;
    color?: string | null;
    isDefault?: boolean;
  }) => Promise<LibrarySpace>;
  updateSpace: (id: string, data: Partial<LibrarySpace>) => Promise<LibrarySpace>;
  deleteSpace: (id: string) => Promise<void>;
}

const LibrarySpaceContext = createContext<LibrarySpaceContextType | undefined>(undefined);

const STORAGE_KEY = "colophon_active_library_space_id";

export function LibrarySpaceProvider({ children }: { children: React.ReactNode }) {
  const [spaces, setSpaces] = useState<LibrarySpace[]>([]);
  const [activeSpaceId, setActiveSpaceIdState] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEY) || "DEFAULT";
  });
  const [loading, setLoading] = useState(true);

  const refreshSpaces = useCallback(async () => {
    try {
      const data = await fetchLibrarySpaces();
      setSpaces(data);

      // Resolve active space
      if (data.length > 0) {
        const stored = localStorage.getItem(STORAGE_KEY);
        const match = data.find((s) => s.id === stored);
        if (match) {
          setActiveSpaceIdState(match.id);
        } else if (stored === "ALL") {
          setActiveSpaceIdState("ALL");
        } else {
          const defaultSpace = data.find((s) => s.isDefault) || data[0];
          setActiveSpaceIdState(defaultSpace.id);
          localStorage.setItem(STORAGE_KEY, defaultSpace.id);
        }
      }
    } catch (err) {
      console.warn("Failed to load library spaces:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshSpaces();
  }, [refreshSpaces]);

  const setActiveSpaceId = (id: string) => {
    setActiveSpaceIdState(id);
    localStorage.setItem(STORAGE_KEY, id);
  };

  const createSpace = async (data: {
    name: string;
    description?: string | null;
    location?: string | null;
    icon?: string | null;
    color?: string | null;
    isDefault?: boolean;
  }) => {
    const created = await createLibrarySpace(data);
    await refreshSpaces();
    setActiveSpaceId(created.id);
    return created;
  };

  const updateSpace = async (id: string, data: Partial<LibrarySpace>) => {
    const updated = await updateLibrarySpace(id, data);
    await refreshSpaces();
    return updated;
  };

  const deleteSpace = async (id: string) => {
    const res = await deleteLibrarySpace(id);
    await refreshSpaces();
    if (res.movedToDefaultId) {
      setActiveSpaceId(res.movedToDefaultId);
    }
  };

  const activeSpace = spaces.find((s) => s.id === activeSpaceId) || null;

  return (
    <LibrarySpaceContext.Provider
      value={{
        spaces,
        activeSpace,
        activeSpaceId,
        loading,
        setActiveSpaceId,
        refreshSpaces,
        createSpace,
        updateSpace,
        deleteSpace,
      }}
    >
      {children}
    </LibrarySpaceContext.Provider>
  );
}

export function useLibrarySpace() {
  const context = useContext(LibrarySpaceContext);
  if (!context) {
    throw new Error("useLibrarySpace must be used within a LibrarySpaceProvider");
  }
  return context;
}
