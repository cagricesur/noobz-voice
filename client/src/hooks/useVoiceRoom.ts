import { useEffect, useRef, useState, useCallback } from 'react'
import { socket } from '../lib/socket'

interface PeerState {
  stream: MediaStream | null
  displayName?: string
}

export function useVoiceRoom(roomId: string | undefined, _displayName: string) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [remotePeers, setRemotePeers] = useState<Map<string, PeerState>>(new Map())
  const [isMuted, setIsMuted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const peersRef = useRef<Map<string, { pc: RTCPeerConnection; pendingCandidates: RTCIceCandidate[] }>>(new Map())
  const streamRef = useRef<MediaStream | null>(null)

  const getOrCreateLocalStream = useCallback(async () => {
    if (streamRef.current) return streamRef.current
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
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
          next.set(remoteSocketId, { stream, displayName: existing?.displayName })
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
        next.set(remoteSocketId, { stream: null, displayName: data.displayName })
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

    socket.on('user-joined', onUserJoined)
    socket.on('webrtc-offer', onWebrtcOffer)
    socket.on('webrtc-answer', onWebrtcAnswer)
    socket.on('webrtc-ice', onWebrtcIce)
    socket.on('user-left', onUserLeft)

    return () => {
      cancelled = true
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

  const setMuted = useCallback((muted: boolean) => {
    setIsMuted(muted)
  }, [])

  return {
    localStream,
    remotePeers,
    isMuted,
    setMuted,
    error,
  }
}
