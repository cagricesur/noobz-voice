import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Container,
  Title,
  Text,
  TextInput,
  Button,
  Stack,
  Paper,
  Checkbox,
} from "@mantine/core";
import { useRoomStore } from "../stores/roomStore";
import {
  DISPLAY_NAME_MAX_LENGTH,
  DISPLAY_NAME_MIN_LENGTH,
  DISPLAY_NAME_STORAGE_KEY,
  normalizeDisplayName,
} from "../lib/constants";

function getRandomGuestName(): string {
  return `Guest-${Math.random().toString(36).slice(2, 8)}`;
}

export function IndexPage() {
  const navigate = useNavigate();
  const { displayName, setDisplayName } = useRoomStore();
  const [rememberName, setRememberName] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  // Load saved display name on mount (normalized)
  useEffect(() => {
    const saved = localStorage.getItem(DISPLAY_NAME_STORAGE_KEY);
    if (saved != null && saved.trim() !== "") {
      const normalized = normalizeDisplayName(saved);
      if (normalized) setDisplayName(normalized);
      setRememberName(true);
    }
  }, [setDisplayName]);

  // Persist or clear based on checkbox and displayName
  useEffect(() => {
    if (rememberName) {
      localStorage.setItem(DISPLAY_NAME_STORAGE_KEY, displayName);
    } else {
      localStorage.removeItem(DISPLAY_NAME_STORAGE_KEY);
    }
  }, [rememberName, displayName]);

  const handleRememberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const checked = e.currentTarget.checked;
    setRememberName(checked);
    if (!checked) {
      setDisplayName(getRandomGuestName());
    }
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setJoinError(null);
    setDisplayName(normalizeDisplayName(e.currentTarget.value));
  };

  const handleJoin = () => {
    setJoinError(null);
    const raw = normalizeDisplayName(displayName);
    const name = raw || getRandomGuestName();
    if (name.length < DISPLAY_NAME_MIN_LENGTH) {
      setJoinError(`Name must be at least ${DISPLAY_NAME_MIN_LENGTH} characters`);
      return;
    }
    setDisplayName(name);
    navigate({ to: "/room" });
  };

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
              placeholder={`${DISPLAY_NAME_MIN_LENGTH}–${DISPLAY_NAME_MAX_LENGTH} characters`}
              value={displayName}
              onChange={handleNameChange}
              maxLength={DISPLAY_NAME_MAX_LENGTH}
              error={joinError ?? undefined}
            />
            <Checkbox
              label="Remember my name"
              checked={rememberName}
              onChange={handleRememberChange}
            />
            <Button variant="filled" fullWidth onClick={handleJoin}>
              Join room
            </Button>
          </Stack>
        </Paper>
      </Stack>
    </Container>
  );
}
