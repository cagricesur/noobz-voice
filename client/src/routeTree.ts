import { createRootRoute, createRoute } from '@tanstack/react-router'
import { RootLayout } from './components/RootLayout'
import { IndexPage } from './routes/IndexPage'
import { RoomPage } from './routes/RoomPage'

export const rootRoute = createRootRoute({
  component: RootLayout,
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: IndexPage,
})

const roomRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'room/$roomId',
  component: RoomPage,
})

export const routeTree = rootRoute.addChildren([indexRoute, roomRoute])
