import { io } from 'socket.io-client'

const origin = typeof window !== 'undefined' ? window.location.origin : ''
const socketUrl = import.meta.env.VITE_SOCKET_URL ?? origin

export const socket = io(socketUrl, {
  path: '/socket.io',
  autoConnect: true,
})
