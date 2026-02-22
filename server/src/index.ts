import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import { setupSocketHandlers } from './socket.js'

const app = express()
const httpServer = createServer(app)

const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
    methods: ['GET', 'POST'],
  },
})

app.use(express.json())

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

setupSocketHandlers(io)

const PORT = Number(process.env.PORT) || 3001
httpServer.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`)
})
