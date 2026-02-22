import type { Server } from 'socket.io'

const DISPLAY_NAME_MAX_LENGTH = 15

function normalizeDisplayName(value: string): string {
  const name = value
    .replace(/[^a-zA-Z0-9-]/g, '')
    .trim()
    .slice(0, DISPLAY_NAME_MAX_LENGTH)
  return name || 'Guest'
}

const rooms = new Map<string, Set<string>>()

export function setupSocketHandlers(io: Server) {
  io.on('connection', (socket) => {
    socket.on('join-room', (roomId: string, displayName?: string) => {
      const id = String(roomId).trim().slice(0, 32)
      if (!id) return
      const name = normalizeDisplayName(displayName ?? 'Guest')
      const nameLower = name.toLowerCase()
      if (!rooms.has(id)) rooms.set(id, new Set())
      const room = rooms.get(id)!
      const nameTaken = Array.from(room).some((sid) => {
        const s = io.sockets.sockets.get(sid)
        const existing = (s?.data.displayName as string) ?? ''
        return existing.toLowerCase() === nameLower
      })
      if (nameTaken) {
        socket.emit('name-taken')
        return
      }
      socket.join(id)
      room.add(socket.id)
      socket.data.roomId = id
      socket.data.displayName = name
      socket.data.muted = false
      socket.to(id).emit('user-joined', { socketId: socket.id, displayName: socket.data.displayName })
      const peers = Array.from(room)
        .filter((sid) => sid !== socket.id)
        .map((sid) => {
          const s = io.sockets.sockets.get(sid)
          return s
            ? { socketId: sid, displayName: (s.data.displayName as string) ?? 'Guest', muted: (s.data.muted as boolean) ?? false }
            : null
        })
        .filter(Boolean) as { socketId: string; displayName: string; muted: boolean }[]
      socket.emit('joined-room', { roomId: id, peers })
    })

    socket.on('set-muted', (muted: boolean) => {
      const roomId = socket.data.roomId as string | undefined
      if (roomId) {
        socket.data.muted = muted
        io.to(roomId).emit('user-muted', { socketId: socket.id, muted })
      }
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

    socket.on('ping', (timestamp: number) => {
      socket.emit('pong', timestamp)
    })
  })
}
