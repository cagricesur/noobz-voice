import { create } from 'zustand'

function getDefaultDisplayName(): string {
  const suffix = Math.random().toString(36).slice(2, 8)
  return `Guest-${suffix}`
}

interface RoomState {
  displayName: string
  setDisplayName: (name: string) => void
}

export const useRoomStore = create<RoomState>((set) => ({
  displayName: getDefaultDisplayName(),
  setDisplayName: (displayName) => set({ displayName }),
}))
