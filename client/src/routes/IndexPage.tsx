import { useNavigate } from '@tanstack/react-router'
import { Container, Title, Text, TextInput, Button, Stack, Paper } from '@mantine/core'
import { useRoomStore } from '../stores/roomStore'
import { ROOM_ID } from '../lib/constants'

export function IndexPage() {
  const navigate = useNavigate()
  const { displayName, setDisplayName } = useRoomStore()

  const handleJoin = () => {
    navigate({ to: '/room' })
  }

  return (
    <Container size="xs" py="xl">
      <Stack gap="lg">
        <Title order={1} ta="center">
          Voice chat
        </Title>
        <Text c="dimmed" ta="center" size="sm">
          Join the room to talk with everyone connected.
        </Text>
        <Paper p="md" withBorder>
          <Stack gap="md">
            <TextInput
              label="Your name"
              placeholder="How others see you"
              value={displayName}
              onChange={(e) => setDisplayName(e.currentTarget.value)}
            />
            <Button variant="filled" fullWidth onClick={handleJoin}>
              Join room
            </Button>
          </Stack>
        </Paper>
      </Stack>
    </Container>
  )
}
