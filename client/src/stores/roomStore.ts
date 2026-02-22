import { create } from 'zustand'

interface RoomState {
  displayName: string
  setDisplayName: (name: string) => void
}

export const useRoomStore = create<RoomState>((set) => ({
  displayName: 'Guest',
  setDisplayName: (displayName) => set({ displayName }),
}))
