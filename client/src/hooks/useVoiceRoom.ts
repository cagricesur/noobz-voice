import { useEffect, useRef, useState, useCallback } from 'react'
import { socket } from '../lib/socket'

const SPEAKING_THRESHOLD = 25
const LEVEL_POLL_MS = 100

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
    analyser.smoothingTimeConstant = 0.6
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

export function useVoiceRoom(roomId: string | undefined, _displayName: string) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [remotePeers, setRemotePeers] = useState<Map<string, PeerState>>(new Map())
  const [isMuted, setIsMuted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [localIsSpeaking, setLocalIsSpeaking] = useState(false)
  const [speakingPeerIds, setSpeakingPeerIds] = useState<Record<string, boolean>>({})
  const [peerDelayMs, setPeerDelayMs] = useState<Record<string, number>>({})
  const peersRef = useRef<Map<string, { pc: RTCPeerConnection; pendingCandidates: RTCIceCandidate[] }>>(new Map())
  const streamRef = useRef<MediaStream | null>(null)
  const analysersRef = useRef<{ ctx: AudioContext; local: AnalyserNode | null; remote: Map<string, AnalyserNode> } | null>(null)

  const getOrCreateLocalStream = useCallback(async () => {
    if (streamRef.current) return streamRef.current
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      })
      streamRef.current = stream
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
    const setup = async () => {
      const stream = await getOrCreateLocalStream()
      if (cancelled || !stream) return
      stream.getAudioTracks().forEach((track) => {
        track.enabled = !isMuted
      })
    }
    setup()

    const onUserJoined = async (data: { socketId: string; displayName?: string }) => {
      const remoteSocketId = data.socketId
      if (remoteSocketId === socket.id) return
      setRemotePeers((prev) => {
        const next = new Map(prev)
        next.set(remoteSocketId, { stream: null, displayName: data.displayName, muted: false })
        return next
      })
      const stream = await getOrCreateLocalStream()
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
      const stream = await getOrCreateLocalStream()
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

    const ctx = new AudioContext()
    void ctx.resume() // ensure context runs so local level is detected (e.g. after user gesture)
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

    const interval = setInterval(() => {
      const current = analysersRef.current
      if (!current) return

      let localSpeaking = false
      if (current.local) {
        const level = getAverageLevel(current.local)
        localSpeaking = !isMuted && level > SPEAKING_THRESHOLD
      }
      setLocalIsSpeaking(localSpeaking)

      const next: Record<string, boolean> = {}
      current.remote.forEach((analyser, peerId) => {
        next[peerId] = getAverageLevel(analyser) > SPEAKING_THRESHOLD
      })
      setSpeakingPeerIds((prev) => {
        const same =
          Object.keys(prev).length === Object.keys(next).length &&
          Object.keys(next).every((id) => prev[id] === next[id])
        return same ? prev : next
      })
    }, LEVEL_POLL_MS)

    return () => {
      clearInterval(interval)
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
    localIsSpeaking,
    speakingPeerIds,
    peerDelayMs,
  }
}
