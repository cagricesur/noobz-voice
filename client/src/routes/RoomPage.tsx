import {
  ActionIcon,
  Alert,
  Box,
  Button,
  Container,
  Group,
  Progress,
  Select,
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
  outputDeviceId,
}: {
  stream: MediaStream;
  peerId: string;
  outputDeviceId?: string | null;
}) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    if (!ref.current || !stream) return;
    ref.current.srcObject = stream;
  }, [stream]);
  useEffect(() => {
    if (!ref.current || !outputDeviceId || typeof ref.current.setSinkId !== "function") return;
    ref.current.setSinkId(outputDeviceId).catch(() => {});
  }, [outputDeviceId]);
  return (
    <audio
      ref={ref}
      autoPlay
      playsInline
      aria-label={`Remote peer ${peerId}`}
    />
  );
}

const SPEAKING_BORDER_THRESHOLD = 15;

function UserBox({
  name,
  isLocal,
  isMuted,
  onMuteToggle,
  audioLevel,
  pingMs,
  voiceDelayMs,
  children,
}: {
  name: string;
  isLocal: boolean;
  isMuted?: boolean;
  onMuteToggle?: () => void;
  audioLevel: number;
  pingMs?: number | null;
  voiceDelayMs?: number | null;
  children?: React.ReactNode;
}) {
  const isSpeaking = audioLevel > SPEAKING_BORDER_THRESHOLD;
  return (
    <Box
      p="md"
      style={{
        borderRadius: 8,
        border: isSpeaking
          ? "2px solid var(--mantine-color-green-5)"
          : "1px solid var(--mantine-color-default-border)",
        transition: "border-color 0.15s ease, border-width 0.15s ease",
      }}
    >
      <Group justify="space-between" wrap="nowrap">
        <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
          <Box
            style={{
              width: 40,
              height: 40,
              borderRadius: 8,
              backgroundColor: "var(--mantine-color-default-hover)",
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
              {isMuted ? "Muted" : "Connected"}
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
      <Progress
        value={audioLevel}
        size="xs"
        mt="sm"
        radius="xl"
        color="green"
        style={{ transition: "width 0.1s ease" }}
      />
    </Box>
  );
}

interface AudioDevices {
  inputs: MediaDeviceInfo[];
  outputs: MediaDeviceInfo[];
}

function distinctByDeviceId(devices: MediaDeviceInfo[]): MediaDeviceInfo[] {
  const seen = new Set<string>();
  return devices.filter((d) => {
    if (seen.has(d.deviceId)) return false;
    seen.add(d.deviceId);
    return true;
  });
}

export function RoomPage() {
  const navigate = useNavigate();
  const { displayName, inputDeviceId, outputDeviceId, setInputDeviceId, setOutputDeviceId } = useRoomStore();
  const [joined, setJoined] = useState(false);
  const [nameTaken, setNameTaken] = useState(false);
  const [serverPingMs, setServerPingMs] = useState<number | null>(null);
  const [devices, setDevices] = useState<AudioDevices>({ inputs: [], outputs: [] });
  const {
    remotePeers,
    isMuted,
    setMuted,
    error,
    localLevel,
    peerLevels,
    peerDelayMs,
  } = useVoiceRoom(ROOM_ID, displayName || "Guest", inputDeviceId);

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

  useEffect(() => {
    if (!joined) return;
    navigator.mediaDevices.enumerateDevices().then((list) => {
      setDevices({
        inputs: distinctByDeviceId(list.filter((d) => d.kind === "audioinput")),
        outputs: distinctByDeviceId(list.filter((d) => d.kind === "audiooutput")),
      });
    });
  }, [joined]);

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
      isMuted,
      audioLevel: localLevel,
      pingMs: serverPingMs,
    },
    ...Array.from(remotePeers.entries()).map(([peerId, state]) => ({
      id: peerId,
      name: state.displayName ?? peerId.slice(0, 8),
      isLocal: false,
      isMuted: state.muted,
      audioLevel: peerLevels[peerId] ?? 0,
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

        <Group gap="md">
          <Select
            label="Microphone"
            placeholder="Default"
            data={[
              { value: "", label: "Default" },
              ...devices.inputs.map((d) => ({ value: d.deviceId, label: d.label || `Mic ${d.deviceId.slice(0, 8)}` })),
            ]}
            value={inputDeviceId ?? ""}
            onChange={(v) => setInputDeviceId(v || null)}
            clearable
            size="xs"
            style={{ minWidth: 180 }}
          />
          <Select
            label="Speaker"
            placeholder="Default"
            data={[
              { value: "", label: "Default" },
              ...devices.outputs.map((d) => ({ value: d.deviceId, label: d.label || `Speaker ${d.deviceId.slice(0, 8)}` })),
            ]}
            value={outputDeviceId ?? ""}
            onChange={(v) => setOutputDeviceId(v || null)}
            clearable
            size="xs"
            style={{ minWidth: 180 }}
          />
        </Group>

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
                isLocal
                isMuted={"isMuted" in u ? u.isMuted : undefined}
                onMuteToggle={handleMuteToggle}
                audioLevel={"audioLevel" in u ? u.audioLevel : 0}
                pingMs={"pingMs" in u ? u.pingMs : undefined}
              />
            ) : (
              <UserBox
                key={u.id}
                name={u.name}
                isLocal={false}
                isMuted={"isMuted" in u ? u.isMuted : undefined}
                audioLevel={"audioLevel" in u ? u.audioLevel : 0}
                voiceDelayMs={"voiceDelayMs" in u ? u.voiceDelayMs : undefined}
              >
                {"stream" in u && u.stream && (
                  <RemoteAudio stream={u.stream} peerId={u.id} outputDeviceId={outputDeviceId} />
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
