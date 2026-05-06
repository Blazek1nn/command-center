"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ActiveProjectState {
  activeProjectId: number | null;
  activeProjectName: string | null;
  setActiveProject: (id: number | null, name: string | null) => void;
}

export const useActiveProject = create<ActiveProjectState>()(
  persist(
    (set) => ({
      activeProjectId: null,
      activeProjectName: null,
      setActiveProject: (id, name) =>
        set({ activeProjectId: id, activeProjectName: name }),
    }),
    {
      name: "command-center.active-project",
      // skipHydration: evita hydration mismatch em SSR. Hidratamos no client
      // via useActiveProject.persist.rehydrate() em <Providers> useEffect.
      skipHydration: true,
    },
  ),
);
