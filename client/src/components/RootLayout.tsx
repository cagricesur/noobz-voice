import { Outlet } from '@tanstack/react-router'
import { AppShell, Title, Group } from '@mantine/core'
import { Link } from '@tanstack/react-router'

export function RootLayout() {
  return (
    <AppShell
      header={{ height: 56 }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Link to="/" style={{ color: 'inherit', textDecoration: 'none' }}>
            <Title order={4}>Noobz Voice</Title>
          </Link>
        </Group>
      </AppShell.Header>
      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  )
}
