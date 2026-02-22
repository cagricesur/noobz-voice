import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from '@tanstack/react-router'
import {
  Container,
  Title,
  Text,
  Button,
  Paper,
  Stack,
  Group,
  Alert,
  ActionIcon,
  Card,
  Text as MantineText,
} from '@mantine/core'
import { IconMicrophone, IconMicrophoneOff } from '@tabler/icons-react'
import { socket } from '../lib/socket'
import { useRoomStore } from '../stores/roomStore'
import { useVoiceRoom } from '../hooks/useVoiceRoom'

function RemoteAudio({ stream, peerId }: { stream: MediaStream; peerId: string }) {
  const ref = useRef<HTMLAudioElement>(null)
  useEffect(() => {
    if (!ref.current || !stream) return
    ref.current.srcObject = stream
  }, [stream])
  return <audio ref={ref} autoPlay playsInline aria-label={`Remote peer ${peerId}`} />
}

export function RoomPage() {
  const { roomId } = useParams({ strict: false }) as { roomId: string }
  const navigate = useNavigate()
  const { displayName } = useRoomStore()
  const [joined, setJoined] = useState(false)
  const { remotePeers, isMuted, setMuted, error } = useVoiceRoom(roomId, displayName || 'Guest')

  useEffect(() => {
    if (!roomId) return
    socket.emit('join-room', roomId, displayName || 'Guest')
    const onJoined = () => setJoined(true)
    socket.on('joined-room', onJoined)
    return () => {
      socket.off('joined-room', onJoined)
    }
  }, [roomId, displayName])

  const handleLeave = () => {
    socket.disconnect()
    socket.connect()
    navigate({ to: '/' })
  }

  return (
    <Container size="sm" py="xl">
      <Stack gap="lg">
        <Title order={2}>Room: {roomId}</Title>
        <Text c="dimmed">Share this code so others can join. You can talk when connected.</Text>

        {error && (
          <Alert color="red" title="Microphone access">
            {error}
          </Alert>
        )}

        <Paper p="lg" withBorder>
          <Stack gap="md">
            <Group justify="space-between">
              <MantineText fw={600} size="lg">
                {roomId}
              </MantineText>
              <Button variant="light" color="red" size="xs" onClick={handleLeave}>
                Leave room
              </Button>
            </Group>

            {joined && (
              <>
                <Group>
                  <Text size="sm" c="dimmed">
                    Your microphone:
                  </Text>
                  <ActionIcon
                    variant={isMuted ? 'filled' : 'light'}
                    color={isMuted ? 'red' : 'green'}
                    size="lg"
                    onClick={() => setMuted(!isMuted)}
                    title={isMuted ? 'Unmute' : 'Mute'}
                  >
                    {isMuted ? <IconMicrophoneOff size={20} /> : <IconMicrophone size={20} />}
                  </ActionIcon>
                  <Text size="sm">{isMuted ? 'Muted' : 'On'}</Text>
                </Group>

                {Array.from(remotePeers.entries()).length > 0 && (
                  <Stack gap="xs">
                    <Text size="sm" c="dimmed">
                      In call:
                    </Text>
                    {Array.from(remotePeers.entries()).map(([peerId, state]) => (
                      <Card key={peerId} withBorder padding="sm">
                        <Group justify="space-between">
                          <Text size="sm">{state.displayName ?? peerId.slice(0, 8)}</Text>
                          {state.stream && <RemoteAudio stream={state.stream} peerId={peerId} />}
                        </Group>
                      </Card>
                    ))}
                  </Stack>
                )}

                {Array.from(remotePeers.entries()).length === 0 && (
                  <Text size="sm" c="dimmed">
                    Waiting for others to join…
                  </Text>
                )}
              </>
            )}
          </Stack>
        </Paper>
      </Stack>
    </Container>
  )
}
