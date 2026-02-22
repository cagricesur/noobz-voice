import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Container, Title, Text, TextInput, Button, Stack, Paper } from '@mantine/core'
import { randomId } from '@mantine/hooks'
import { useRoomStore } from '../stores/roomStore'

export function IndexPage() {
  const navigate = useNavigate()
  const [roomId, setRoomId] = useState('')
  const { displayName, setDisplayName } = useRoomStore()

  const handleCreateRoom = () => {
    const id = randomId().slice(0, 8)
    navigate({ to: '/room/$roomId', params: { roomId: id } })
  }

  const handleJoinRoom = () => {
    const id = (roomId || randomId()).trim().slice(0, 8)
    if (!id) return
    navigate({ to: '/room/$roomId', params: { roomId: id } })
  }

  return (
    <Container size="xs" py="xl">
      <Stack gap="lg">
        <Title order={1} ta="center">
          Voice chat
        </Title>
        <Text c="dimmed" ta="center" size="sm">
          Create a room or join with a code. Everyone in the same room can talk.
        </Text>
        <Paper p="md" withBorder>
          <Stack gap="md">
            <TextInput
              label="Your name"
              placeholder="How others see you"
              value={displayName}
              onChange={(e) => setDisplayName(e.currentTarget.value)}
            />
            <Button variant="light" fullWidth onClick={handleCreateRoom}>
              Create room
            </Button>
          </Stack>
        </Paper>
        <Paper p="md" withBorder>
          <Stack gap="md">
            <TextInput
              label="Room code"
              placeholder="Enter code to join"
              value={roomId}
              onChange={(e) => setRoomId(e.currentTarget.value)}
            />
            <Button variant="filled" fullWidth onClick={handleJoinRoom}>
              Join room
            </Button>
          </Stack>
        </Paper>
      </Stack>
    </Container>
  )
}
