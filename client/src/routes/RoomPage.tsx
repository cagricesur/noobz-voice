import {
  ActionIcon,
  Alert,
  Box,
  Button,
  Container,
  Group,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import {
  IconMicrophone,
  IconMicrophoneOff,
  IconUser,
} from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useVoiceRoom } from "../hooks/useVoiceRoom";
import { normalizeDisplayName, ROOM_ID } from "../lib/constants";
import { socket } from "../lib/socket";
import { useRoomStore } from "../stores/roomStore";

function RemoteAudio({
  stream,
  peerId,
}: {
  stream: MediaStream;
  peerId: string;
}) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    if (!ref.current || !stream) return;
    ref.current.srcObject = stream;
  }, [stream]);
  return (
    <audio
      ref={ref}
      autoPlay
      playsInline
      aria-label={`Remote peer ${peerId}`}
    />
  );
}

function UserBox({
  name,
  isSpeaking,
  isLocal,
  isMuted,
  onMuteToggle,
  pingMs,
  voiceDelayMs,
  children,
}: {
  name: string;
  isSpeaking: boolean;
  isLocal: boolean;
  isMuted?: boolean;
  onMuteToggle?: () => void;
  pingMs?: number | null;
  voiceDelayMs?: number | null;
  children?: React.ReactNode;
}) {
  return (
    <Box
      p="md"
      style={{
        borderRadius: 8,
        border: `2px solid ${isSpeaking ? "var(--mantine-color-green-5)" : "var(--mantine-color-default-border)"}`,
        backgroundColor: isSpeaking
          ? "var(--mantine-color-green-0)"
          : undefined,
        transition: "border-color 0.15s ease, background-color 0.15s ease",
      }}
    >
      <Group justify="space-between" wrap="nowrap">
        <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
          <Box
            style={{
              width: 40,
              height: 40,
              borderRadius: 8,
              backgroundColor: isSpeaking
                ? "var(--mantine-color-green-2)"
                : "var(--mantine-color-default-hover)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <IconUser size={22} stroke={1.5} />
          </Box>
          <div style={{ minWidth: 0 }}>
            <Text size="sm" fw={500} truncate>
              {name}
              {isLocal && (
                <Text component="span" size="xs" c="dimmed" ml={4}>
                  (you)
                </Text>
              )}
            </Text>
            <Text size="xs" c="dimmed">
              {isSpeaking ? "Speaking…" : isMuted ? "Muted" : "Connected"}
            </Text>
            {(pingMs != null || voiceDelayMs != null) && (
              <Text size="xs" c="dimmed">
                {isLocal && pingMs != null && `Ping: ${pingMs} ms`}
                {!isLocal && voiceDelayMs != null && `Voice: ~${voiceDelayMs} ms`}
              </Text>
            )}
          </div>
        </Group>
        {isLocal && onMuteToggle !== undefined && (
          <ActionIcon
            variant={isMuted ? "filled" : "light"}
            color={isMuted ? "red" : "green"}
            size="lg"
            onClick={onMuteToggle}
            title={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? (
              <IconMicrophoneOff size={20} />
            ) : (
              <IconMicrophone size={20} />
            )}
          </ActionIcon>
        )}
        {!isLocal && isMuted && (
          <ActionIcon variant="subtle" color="gray" size="sm" title="Muted" style={{ cursor: "default" }}>
            <IconMicrophoneOff size={18} />
          </ActionIcon>
        )}
        {children}
      </Group>
    </Box>
  );
}

export function RoomPage() {
  const navigate = useNavigate();
  const { displayName } = useRoomStore();
  const [joined, setJoined] = useState(false);
  const [nameTaken, setNameTaken] = useState(false);
  const [serverPingMs, setServerPingMs] = useState<number | null>(null);
  const {
    remotePeers,
    isMuted,
    setMuted,
    error,
    localIsSpeaking,
    speakingPeerIds,
    peerDelayMs,
  } = useVoiceRoom(ROOM_ID, displayName || "Guest");

  useEffect(() => {
    setNameTaken(false);
    const name = normalizeDisplayName(displayName) || "Guest";
    socket.emit("join-room", ROOM_ID, name);
    const onJoined = () => setJoined(true);
    const onNameTaken = () => setNameTaken(true);
    socket.on("joined-room", onJoined);
    socket.on("name-taken", onNameTaken);
    return () => {
      socket.off("joined-room", onJoined);
      socket.off("name-taken", onNameTaken);
    };
  }, [displayName]);

  // Broadcast mute state when we join and whenever it changes
  useEffect(() => {
    if (joined) socket.emit("set-muted", isMuted);
  }, [joined, isMuted]);

  // Measure ping to server (RTT) when in room
  useEffect(() => {
    if (!joined) {
      setServerPingMs(null);
      return;
    }
    const PING_INTERVAL_MS = 3000;
    const onPong = (sentAt: number) => {
      setServerPingMs(Math.round(Date.now() - sentAt));
    };
    socket.on("pong", onPong);
    const interval = setInterval(() => {
      socket.emit("ping", Date.now());
    }, PING_INTERVAL_MS);
    socket.emit("ping", Date.now());
    return () => {
      clearInterval(interval);
      socket.off("pong", onPong);
      setServerPingMs(null);
    };
  }, [joined]);

  const handleLeave = () => {
    socket.disconnect();
    socket.connect();
    navigate({ to: "/" });
  };

  const handleMuteToggle = () => {
    const next = !isMuted;
    setMuted(next);
    socket.emit("set-muted", next);
  };

  const userList = [
    {
      id: "local",
      name: displayName || "Guest",
      isLocal: true,
      isSpeaking: localIsSpeaking,
      isMuted,
      pingMs: serverPingMs,
    },
    ...Array.from(remotePeers.entries()).map(([peerId, state]) => ({
      id: peerId,
      name: state.displayName ?? peerId.slice(0, 8),
      isLocal: false,
      isSpeaking: !!speakingPeerIds[peerId],
      isMuted: state.muted,
      voiceDelayMs: peerDelayMs[peerId],
      stream: state.stream,
    })),
  ];

  return (
    <Container size="sm" py="xl">
      <Stack gap="lg">
        <Group justify="space-between" align="flex-start">
          <div>
            <Title order={2}>Voice chat</Title>
            <Text c="dimmed" size="sm">
              Everyone in the room is listed below. Your box highlights when you
              speak.
            </Text>
          </div>
          <Button variant="light" color="red" size="xs" onClick={handleLeave}>
            Leave
          </Button>
        </Group>

        {error && (
          <Alert color="red" title="Microphone access">
            {error}
          </Alert>
        )}

        {nameTaken && (
          <Alert
            color="orange"
            title="Name already in use"
            withCloseButton
            onClose={() => setNameTaken(false)}
          >
            Someone else is using this name. Go back and choose a different one.
            <Button
              variant="light"
              size="xs"
              mt="sm"
              onClick={() => navigate({ to: "/" })}
            >
              Choose another name
            </Button>
          </Alert>
        )}

        <Stack gap="sm">
          {userList.map((u) =>
            u.isLocal ? (
              <UserBox
                key="local"
                name={u.name}
                isSpeaking={localIsSpeaking}
                isLocal
                isMuted={"isMuted" in u ? u.isMuted : undefined}
                onMuteToggle={handleMuteToggle}
                pingMs={"pingMs" in u ? u.pingMs : undefined}
              />
            ) : (
              <UserBox
                key={u.id}
                name={u.name}
                isSpeaking={u.isSpeaking}
                isLocal={false}
                isMuted={"isMuted" in u ? u.isMuted : undefined}
                voiceDelayMs={"voiceDelayMs" in u ? u.voiceDelayMs : undefined}
              >
                {"stream" in u && u.stream && (
                  <RemoteAudio stream={u.stream} peerId={u.id} />
                )}
              </UserBox>
            ),
          )}
          {userList.length === 1 && (
            <Text size="sm" c="dimmed" ta="center" py="md">
              {joined ? "Waiting for others to join…" : "Connecting…"}
            </Text>
          )}
        </Stack>
      </Stack>
    </Container>
  );
}
