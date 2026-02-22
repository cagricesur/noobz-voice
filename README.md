# Noobz Voice

Browser-based voice chat: create or join a room and talk with others in the same room.

## Stack

- **Frontend:** React, Vite, TypeScript, TanStack Router, Mantine, Socket.IO client, Zustand
- **Backend:** Node.js, Express, Socket.IO (signaling)
- **Voice:** WebRTC (to be wired in-room)

## Setup

```bash
npm run install:all
```

## Run locally

```bash
npm run dev
```

- Client: http://localhost:5173  
- Server: http://localhost:3001 (API + Socket.IO proxied from client)

## Scripts

| Command | Description |
|--------|-------------|
| `npm run dev` | Run client and server |
| `npm run dev:client` | Run Vite dev server only |
| `npm run dev:server` | Run Express + Socket.IO server only |
| `npm run build` | Build client and server |
| `npm run install:all` | Install root, client, and server deps |

## Deploy (Render.com)

Yes, you can deploy now. See **[DEPLOY.md](./DEPLOY.md)** for step-by-step Render setup (two services: Static Site + Web Service, env vars, root directories).

**Summary:** Backend = Web Service, root `server`, set `CLIENT_ORIGIN`. Frontend = Static Site, root `client`, set `VITE_SOCKET_URL` to your backend URL so the client connects in production.

## What else you might add later

| Need | When |
|------|------|
| **TURN server** | Users behind strict NAT / corporate firewalls can’t connect. Add a TURN server (e.g. Metered.ca, Twilio) and put it in `RTCPeerConnection` `iceServers`. |
| **Copy room code** | “Copy” button next to the room code for easier sharing. |
| **Persistent rooms** | Rooms are in-memory; server restart clears them. Add Redis or a DB if you want durable rooms. |
| **Rejoin on reconnect** | If the tab sleeps or Socket.IO reconnects, you might leave the room; optional logic to rejoin and re-establish peers. |
| **HTTPS** | Render gives you HTTPS for both frontend and backend; no extra config. |
