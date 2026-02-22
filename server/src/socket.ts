import type { Server } from 'socket.io'

const rooms = new Map<string, Set<string>>()

export function setupSocketHandlers(io: Server) {
  io.on('connection', (socket) => {
    socket.on('join-room', (roomId: string, displayName?: string) => {
      const id = String(roomId).trim().slice(0, 32)
      if (!id) return
      socket.join(id)
      if (!rooms.has(id)) rooms.set(id, new Set())
      rooms.get(id)!.add(socket.id)
      socket.data.roomId = id
      socket.data.displayName = displayName ?? 'Guest'
      socket.to(id).emit('user-joined', { socketId: socket.id, displayName: socket.data.displayName })
      socket.emit('joined-room', { roomId: id })
    })

    socket.on('disconnect', () => {
      const roomId = socket.data.roomId as string | undefined
      if (roomId && rooms.has(roomId)) {
        rooms.get(roomId)!.delete(socket.id)
        if (rooms.get(roomId)!.size === 0) rooms.delete(roomId)
        socket.to(roomId).emit('user-left', { socketId: socket.id })
      }
    })

    socket.on('webrtc-offer', (payload: { to: string; sdp: unknown }) => {
      io.to(payload.to).emit('webrtc-offer', { from: socket.id, sdp: payload.sdp })
    })

    socket.on('webrtc-answer', (payload: { to: string; sdp: unknown }) => {
      io.to(payload.to).emit('webrtc-answer', { from: socket.id, sdp: payload.sdp })
    })

    socket.on('webrtc-ice', (payload: { to: string; candidate: unknown }) => {
      io.to(payload.to).emit('webrtc-ice', { from: socket.id, candidate: payload.candidate })
    })
  })
}
