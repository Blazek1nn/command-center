"use client";

import { create } from "zustand";

interface DialogsState {
  newProjectOpen: boolean;
  openNewProject: () => void;
  closeNewProject: () => void;

  newTaskOpen: boolean;
  openNewTask: () => void;
  closeNewTask: () => void;

  shortcutsOpen: boolean;
  openShortcuts: () => void;
  closeShortcuts: () => void;

  // Sidebar collapse — togglable via Cmd+\
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;

  // Slot que ChatStream registra com sua função `cancel()`. Permite que
  // atalhos globais (Esc) cancelem a request SSE em andamento sem acoplar
  // o keyboard hook diretamente ao useChat().
  cancelHandler: (() => void) | null;
  setCancelHandler: (fn: (() => void) | null) => void;
}

export const useDialogs = create<DialogsState>((set, get) => ({
  newProjectOpen: false,
  openNewProject: () => set({ newProjectOpen: true }),
  closeNewProject: () => set({ newProjectOpen: false }),

  newTaskOpen: false,
  openNewTask: () => set({ newTaskOpen: true }),
  closeNewTask: () => set({ newTaskOpen: false }),

  shortcutsOpen: false,
  openShortcuts: () => set({ shortcutsOpen: true }),
  closeShortcuts: () => set({ shortcutsOpen: false }),

  sidebarCollapsed: false,
  toggleSidebar: () => set({ sidebarCollapsed: !get().sidebarCollapsed }),

  cancelHandler: null,
  setCancelHandler: (fn) => set({ cancelHandler: fn }),
}));
