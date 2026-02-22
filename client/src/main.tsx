import React, { useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import { MantineProvider } from '@mantine/core'
import '@mantine/core/styles.css'
import { RouterProvider, createRouter, useNavigate } from '@tanstack/react-router'
import { routeTree } from './routeTree'

function NotFoundRedirect() {
  const navigate = useNavigate()
  useEffect(() => {
    navigate({ to: '/' })
  }, [navigate])
  return null
}

const router = createRouter({
  routeTree,
  defaultNotFoundComponent: NotFoundRedirect,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MantineProvider defaultColorScheme="dark">
      <RouterProvider router={router} />
    </MantineProvider>
  </React.StrictMode>,
)
