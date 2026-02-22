import { useEffect, useRef, useState, useCallback } from 'react'
import { socket } from '../lib/socket'

const LEVEL_POLL_MS = 80

/** Play a short chime (Discord-style): optional sequence of [frequency, durationMs]. */
function playChime(notes: [number, number][], volume = 0.12) {
  try {
    const ctx = new AudioContext()
    let t = ctx.currentTime
    for (const [freq, durMs] of notes) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      osc.connect(gain)
      gain.connect(ctx.destination)
      gain.gain.setValueAtTime(0, t)
      gain.gain.linearRampToValueAtTime(volume, t + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.001, t + durMs / 1000)
      osc.start(t)
      osc.stop(t + durMs / 1000)
      t += durMs / 1000 + 0.04
    }
    setTimeout(() => ctx.close(), (t - ctx.currentTime) * 1000 + 100)
  } catch {
    // ignore
  }
}

/** Discord-style join: short ascending two-note chime. */
function playJoinSound() {
  playChime([[523.25, 80], [659.25, 100]])
}

/** Discord-style leave: short descending two-note chime. */
function playLeaveSound() {
  playChime([[523.25, 70], [392, 90]])
}
/** Scale raw frequency average (0–255) to 0–100 for progress bar; cap so normal speech doesn't max out */
function levelToPercent(level: number): number {
  return Math.min(100, Math.round((level / 255) * 120))
}

interface PeerState {
  stream: MediaStream | null
  displayName?: string
  muted?: boolean
}

function createStreamAnalyser(stream: MediaStream, ctx: AudioContext): AnalyserNode | null {
  try {
    const source = ctx.createMediaStreamSource(stream)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 256
    analyser.smoothingTimeConstant = 0.4
    source.connect(analyser)
    return analyser
  } catch {
    return null
  }
}

function getAverageLevel(analyser: AnalyserNode): number {
  const data = new Uint8Array(analyser.frequencyBinCount)
  analyser.getByteFrequencyData(data)
  let sum = 0
  for (let i = 0; i < data.length; i++) sum += data[i]
  return data.length > 0 ? sum / data.length : 0
}

export function useVoiceRoom(roomId: string | undefined, _displayName: string, inputDeviceId: string | null) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [remotePeers, setRemotePeers] = useState<Map<string, PeerState>>(new Map())
  const [isMuted, setIsMuted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [localLevel, setLocalLevel] = useState(0)
  const [peerLevels, setPeerLevels] = useState<Record<string, number>>({})
  const [peerDelayMs, setPeerDelayMs] = useState<Record<string, number>>({})
  const peersRef = useRef<Map<string, { pc: RTCPeerConnection; pendingCandidates: RTCIceCandidate[] }>>(new Map())
  const streamRef = useRef<MediaStream | null>(null)
  const inputDeviceIdRef = useRef<string | null>(null)
  const analysersRef = useRef<{ ctx: AudioContext; local: AnalyserNode | null; remote: Map<string, AnalyserNode> } | null>(null)

  const getOrCreateLocalStream = useCallback(async (deviceId: string | null) => {
    if (streamRef.current && inputDeviceIdRef.current === deviceId) return streamRef.current
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
      inputDeviceIdRef.current = null
      setLocalStream(null)
    }
    try {
      const audioConstraint: MediaTrackConstraints = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      }
      if (deviceId) audioConstraint.deviceId = { exact: deviceId }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraint,
        video: false,
      })
      streamRef.current = stream
      inputDeviceIdRef.current = deviceId
      setLocalStream(stream)
      setError(null)
      return stream
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not access microphone'
      setError(msg)
      return null
    }
  }, [])

  const createPeerConnection = useCallback(
    (remoteSocketId: string) => {
      if (peersRef.current.has(remoteSocketId)) return peersRef.current.get(remoteSocketId)!.pc
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      })
      const pendingCandidates: RTCIceCandidate[] = []
      peersRef.current.set(remoteSocketId, { pc, pendingCandidates })

      pc.ontrack = (e) => {
        const stream = e.streams[0]
        if (!stream) return
      setRemotePeers((prev) => {
        const next = new Map(prev)
        const existing = prev.get(remoteSocketId)
        next.set(remoteSocketId, { stream, displayName: existing?.displayName, muted: existing?.muted })
        return next
      })
      }

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          socket.emit('webrtc-ice', { to: remoteSocketId, candidate: e.candidate.toJSON() })
        }
      }

      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
          // Optionally remove peer from UI after a delay
        }
      }

      return pc
    },
    [],
  )

  const flushPendingCandidates = useCallback((remoteSocketId: string) => {
    const entry = peersRef.current.get(remoteSocketId)
    if (!entry) return
    entry.pendingCandidates.forEach((c) => entry.pc.addIceCandidate(c).catch(() => {}))
    entry.pendingCandidates.length = 0
  }, [])

  useEffect(() => {
    if (!roomId) return

    let cancelled = false
    const deviceId = inputDeviceId
    const setup = async () => {
      const stream = await getOrCreateLocalStream(deviceId)
      if (cancelled || !stream) return
      stream.getAudioTracks().forEach((track) => {
        track.enabled = !isMuted
      })
    }
    setup()

    const onUserJoined = async (data: { socketId: string; displayName?: string }) => {
      const remoteSocketId = data.socketId
      if (remoteSocketId === socket.id) return
      playJoinSound()
      setRemotePeers((prev) => {
        const next = new Map(prev)
        next.set(remoteSocketId, { stream: null, displayName: data.displayName, muted: false })
        return next
      })
      const stream = await getOrCreateLocalStream(deviceId)
      if (!stream || cancelled) return
      const pc = createPeerConnection(remoteSocketId)
      stream.getTracks().forEach((track) => pc.addTrack(track, stream))
      try {
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        socket.emit('webrtc-offer', { to: remoteSocketId, sdp: offer })
      } catch (err) {
        console.error('createOffer failed', err)
      }
    }

    const onWebrtcOffer = async (payload: { from: string; sdp: RTCSessionDescriptionInit }) => {
      const fromId = payload.from
      if (fromId === socket.id) return
      const stream = await getOrCreateLocalStream(deviceId)
      if (!stream || cancelled) return
      const pc = createPeerConnection(fromId)
      stream.getTracks().forEach((track) => pc.addTrack(track, stream))
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp))
        flushPendingCandidates(fromId)
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        socket.emit('webrtc-answer', { to: fromId, sdp: answer })
      } catch (err) {
        console.error('handle offer failed', err)
      }
    }

    const onWebrtcAnswer = async (payload: { from: string; sdp: RTCSessionDescriptionInit }) => {
      const entry = peersRef.current.get(payload.from)
      if (!entry) return
      try {
        await entry.pc.setRemoteDescription(new RTCSessionDescription(payload.sdp))
        flushPendingCandidates(payload.from)
      } catch (err) {
        console.error('setRemoteDescription answer failed', err)
      }
    }

    const onWebrtcIce = async (payload: { from: string; candidate: RTCIceCandidateInit }) => {
      const entry = peersRef.current.get(payload.from)
      if (!entry) return
      const candidate = new RTCIceCandidate(payload.candidate)
      if (entry.pc.remoteDescription) {
        await entry.pc.addIceCandidate(candidate).catch(() => {})
      } else {
        entry.pendingCandidates.push(candidate)
      }
    }

    const onUserLeft = (data: { socketId: string }) => {
      playLeaveSound()
      const entry = peersRef.current.get(data.socketId)
      if (entry) {
        entry.pc.close()
        peersRef.current.delete(data.socketId)
      }
      setRemotePeers((prev) => {
        const next = new Map(prev)
        next.delete(data.socketId)
        return next
      })
    }

    const onJoinedRoom = (payload: { roomId: string; peers?: { socketId: string; displayName: string; muted: boolean }[] }) => {
      if (!payload.peers?.length) return
      setRemotePeers((prev) => {
        const next = new Map(prev)
        for (const p of payload.peers!) {
          if (p.socketId === socket.id) continue
          const existing = prev.get(p.socketId)
          next.set(p.socketId, {
            stream: existing?.stream ?? null,
            displayName: p.displayName,
            muted: p.muted,
          })
        }
        return next
      })
    }

    const onUserMuted = (data: { socketId: string; muted: boolean }) => {
      setRemotePeers((prev) => {
        const next = new Map(prev)
        const cur = next.get(data.socketId)
        if (cur) next.set(data.socketId, { ...cur, muted: data.muted })
        return next
      })
    }

    socket.on('joined-room', onJoinedRoom)
    socket.on('user-muted', onUserMuted)
    socket.on('user-joined', onUserJoined)
    socket.on('webrtc-offer', onWebrtcOffer)
    socket.on('webrtc-answer', onWebrtcAnswer)
    socket.on('webrtc-ice', onWebrtcIce)
    socket.on('user-left', onUserLeft)

    return () => {
      cancelled = true
      socket.off('joined-room', onJoinedRoom)
      socket.off('user-muted', onUserMuted)
      socket.off('user-joined', onUserJoined)
      socket.off('webrtc-offer', onWebrtcOffer)
      socket.off('webrtc-answer', onWebrtcAnswer)
      socket.off('webrtc-ice', onWebrtcIce)
      socket.off('user-left', onUserLeft)
      peersRef.current.forEach(({ pc }) => pc.close())
      peersRef.current.clear()
      setRemotePeers(new Map())
    }
  }, [roomId, getOrCreateLocalStream, createPeerConnection, flushPendingCandidates])

  // When input device changes, get new stream and replace track on all existing peer connections
  useEffect(() => {
    if (!roomId) return
    getOrCreateLocalStream(inputDeviceId).then((stream) => {
      if (!stream) return
      const track = stream.getAudioTracks()[0]
      if (!track) return
      for (const [, { pc }] of peersRef.current) {
        pc.getSenders().forEach((sender) => {
          if (sender.track?.kind === 'audio') void sender.replaceTrack(track)
        })
      }
    })
  }, [roomId, inputDeviceId, getOrCreateLocalStream])

  // Sync mute state to local stream tracks
  useEffect(() => {
    if (!streamRef.current) return
    streamRef.current.getAudioTracks().forEach((track) => {
      track.enabled = !isMuted
    })
  }, [isMuted])

  // Voice activity: run analysers on local + remote streams and update speaking state
  useEffect(() => {
    const local = localStream
    const remotes = remotePeers
    if (!local && remotes.size === 0) return

    let cancelled = false
    const intervalRef = { current: null as ReturnType<typeof setInterval> | null }
    const ctx = new AudioContext()
    let localAnalyser: AnalyserNode | null = null
    if (local && local.getAudioTracks().length > 0) {
      localAnalyser = createStreamAnalyser(local, ctx)
    }
    const remoteAnalysers = new Map<string, AnalyserNode>()
    remotes.forEach((state, peerId) => {
      if (state.stream && state.stream.getAudioTracks().length > 0) {
        const a = createStreamAnalyser(state.stream, ctx)
        if (a) remoteAnalysers.set(peerId, a)
      }
    })

    analysersRef.current = { ctx, local: localAnalyser, remote: remoteAnalysers }

    void ctx.resume().then(() => {
      if (cancelled) return
      intervalRef.current = setInterval(() => {
        const current = analysersRef.current
        if (!current) return

        let localPct = 0
        if (current.local && !isMuted) {
          localPct = levelToPercent(getAverageLevel(current.local))
        }
        setLocalLevel(localPct)

        const next: Record<string, number> = {}
        current.remote.forEach((analyser, peerId) => {
          next[peerId] = levelToPercent(getAverageLevel(analyser))
        })
        setPeerLevels((prev) => {
          const same =
            Object.keys(prev).length === Object.keys(next).length &&
            Object.keys(next).every((id) => prev[id] === next[id])
          return same ? prev : next
        })
      }, LEVEL_POLL_MS)
    })

    return () => {
      cancelled = true
      if (intervalRef.current) clearInterval(intervalRef.current)
      analysersRef.current = null
      ctx.close()
    }
  }, [localStream, remotePeers, isMuted])

  const setMuted = useCallback((muted: boolean) => {
    setIsMuted(muted)
  }, [])

  // Poll WebRTC stats for each peer to get RTT; show one-way delay (RTT/2) as voice delay
  useEffect(() => {
    if (!roomId) return
    const DELAY_POLL_MS = 2000
    const interval = setInterval(async () => {
      const next: Record<string, number> = {}
      for (const [peerId, { pc }] of peersRef.current) {
        if (pc.connectionState !== 'connected') continue
        try {
          const report = await pc.getStats()
          for (const stat of report.values()) {
            if (stat.type === 'candidate-pair' && 'currentRoundTripTime' in stat && typeof (stat as { currentRoundTripTime?: number }).currentRoundTripTime === 'number') {
              const rttSec = (stat as { currentRoundTripTime: number }).currentRoundTripTime
              const oneWayMs = Math.round((rttSec * 1000) / 2)
              next[peerId] = oneWayMs
              break
            }
          }
        } catch {
          // ignore
        }
      }
      setPeerDelayMs((prev) => {
        const same = Object.keys(prev).length === Object.keys(next).length && Object.keys(next).every((id) => prev[id] === next[id])
        return same ? prev : next
      })
    }, DELAY_POLL_MS)
    return () => clearInterval(interval)
  }, [roomId])

  return {
    localStream,
    remotePeers,
    isMuted,
    setMuted,
    error,
    localLevel,
    peerLevels,
    peerDelayMs,
  }
}
