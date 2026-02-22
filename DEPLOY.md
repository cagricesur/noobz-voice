# Deploy to Render.com

You can deploy **now**. Use two services: one Static Site (frontend) and one Web Service (backend).

---

## 1. Backend (Web Service)

1. **New → Web Service**
2. Connect your repo.
3. **Root Directory:** `server`
4. **Runtime:** Node
5. **Build Command:** `npm install && npm run build`
6. **Start Command:** `npm start`
7. **Environment:**
   - `CLIENT_ORIGIN` = `https://<your-frontend>.onrender.com` (no trailing slash)  
   - Create the frontend first so you know its URL, then set this.
8. Deploy. Note the backend URL, e.g. `https://noobz-voice-api.onrender.com`.

---

## 2. Frontend (Static Site)

1. **New → Static Site**
2. Connect the same repo.
3. **Root Directory:** `client`
4. **Build Command:** `npm install && npm run build`
5. **Publish Directory:** `dist`
6. **Environment (important):**
   - `VITE_SOCKET_URL` = `https://<your-backend>.onrender.com` (no trailing slash)  
   - Example: `https://noobz-voice-api.onrender.com`
7. Deploy.

The client is built with this env var, so Socket.IO will connect to your backend in production.

---

## 3. After deploy

- Open the frontend URL, create a room, open another tab (or device) and join with the same code. Voice should work.
- **Free tier:** Backend may sleep after inactivity; first request can be slow.

---

## Optional later

- **TURN server** (e.g. Metered.ca, Twilio): if users behind strict NAT/corporate firewalls can’t connect.
- **Health check:** Render can ping `https://<backend>/api/health` for the Web Service.
