/* Programmer: Lalith Satheesh / Date: 09/05/2026 */
'use client';

import { create } from 'zustand';

export interface FlyTarget {
  lat: number;
  lon: number;
  /** Monotonic so flying to the same place twice still triggers a tween. */
  seq: number;
}

interface UiState {
  selectedSignalId: string | null;
  drawerOpen: boolean;
  flyTarget: FlyTarget | null;
  /** Event clicked on the globe. */
  pickedEventId: string | null;
  showCooling: boolean;
  select: (id: string | null) => void;
  openDrawer: (id: string) => void;
  closeDrawer: () => void;
  flyTo: (lat: number, lon: number) => void;
  pick: (id: string | null) => void;
  toggleCooling: () => void;
}

export const useUi = create<UiState>((set, get) => ({
  selectedSignalId: null,
  drawerOpen: false,
  flyTarget: null,
  pickedEventId: null,
  showCooling: true,
  select: (id) => set({ selectedSignalId: id }),
  openDrawer: (id) => set({ selectedSignalId: id, drawerOpen: true }),
  closeDrawer: () => set({ drawerOpen: false }),
  flyTo: (lat, lon) => set({ flyTarget: { lat, lon, seq: (get().flyTarget?.seq ?? 0) + 1 } }),
  pick: (id) => set({ pickedEventId: id }),
  toggleCooling: () => set({ showCooling: !get().showCooling }),
}));
