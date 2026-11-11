
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import App from './App'

function jsonResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  }
}

const projectListResponse = {
  data: [],
  pagination: { page: 1, limit: 20, total: 0 },
}

const unreadCountResponse = {
  data: { count: 0 },
}

describe('App authentication integration', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  afterEach(() => {
    sessionStorage.clear()
    vi.unstubAllGlobals()
  })

  it('restores a valid saved session after the app loads', async () => {
    sessionStorage.setItem('taskflow.accessToken', 'saved-token')

    const requests = []
    const fetchImpl = vi.fn(async (url, options) => {
      requests.push({ url: String(url), options })

      if (String(url).endsWith('/auth/me')) {
        return jsonResponse(200, {
          data: {
            user: {
              id: '8',
              name: 'Project owner',
              role: 'MEMBER',
            },
          },
        })
      }

      if (String(url).includes('/projects?')) {
        return jsonResponse(200, projectListResponse)
      }

      if (String(url).endsWith('/notifications/unread-count')) {
        return jsonResponse(200, unreadCountResponse)
      }

      return jsonResponse(404, {
        error: { message: 'Not found' },
      })
    })

    vi.stubGlobal('fetch', fetchImpl)

    render(<App />)

    expect(
      await screen.findByRole('heading', { name: 'Your projects' }),
    ).toBeInTheDocument()

    expect(screen.getByText('Project owner')).toBeInTheDocument()
    expect(sessionStorage.getItem('taskflow.accessToken')).toBe('saved-token')

    const meRequest = requests.find(({ url }) => url.endsWith('/auth/me'))
    expect(meRequest).toBeDefined()
    expect(meRequest.options.headers.Authorization).toBe('Bearer saved-token')

    await waitFor(() => {
      expect(
        requests.some(({ url }) => url.includes('/projects?')),
      ).toBe(true)
    })
  })

  it('clears an invalid saved token and returns to sign in', async () => {
    sessionStorage.setItem('taskflow.accessToken', 'invalid-token')

    const fetchImpl = vi.fn(async () =>
      jsonResponse(401, {
        error: {
          code: 'INVALID_TOKEN',
          message: 'Authentication token expired',
        },
      }),
    )

    vi.stubGlobal('fetch', fetchImpl)

    render(<App />)

    expect(
      await screen.findByRole('heading', { name: 'Welcome back' }),
    ).toBeInTheDocument()

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(sessionStorage.getItem('taskflow.accessToken')).toBeNull()
  })

  it('sends the login token to protected project APIs and revokes it on sign out', async () => {
    const requests = []

    const fetchImpl = vi.fn(async (url, options) => {
      requests.push({ url: String(url), options })

      if (String(url).endsWith('/auth/login')) {
        return jsonResponse(200, {
          data: {
            accessToken: 'session-token',
            user: { id: '8', name: 'Project owner', role: 'MEMBER' },
          },
        })
      }

      if (String(url).endsWith('/auth/logout')) {
        return { ok: true, status: 204 }
      }

      if (String(url).endsWith('/notifications/unread-count')) {
        return jsonResponse(200, unreadCountResponse)
      }

      return jsonResponse(200, projectListResponse)
    })

    vi.stubGlobal('fetch', fetchImpl)

    render(<App />)

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'owner@example.com' },
    })

    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'Passw0rdOK' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(
      await screen.findByRole('heading', { name: 'Your projects' }),
    ).toBeInTheDocument()

    expect(sessionStorage.getItem('taskflow.accessToken')).toBe('session-token')

    await waitFor(() => {
      expect(
        requests.some(({ url }) => url.endsWith('/projects?page=1&limit=20')),
      ).toBe(true)
    })

    const projectRequest = requests.find(({ url }) => url.includes('/projects?'))

    expect(projectRequest.options.headers.Authorization).toBe(
      'Bearer session-token',
    )

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))

    expect(
      await screen.findByRole('heading', { name: 'Welcome back' }),
    ).toBeInTheDocument()

    const logoutRequest = requests.find(({ url }) => url.endsWith('/auth/logout'))

    expect(logoutRequest).toBeDefined()
    expect(logoutRequest.options.headers.Authorization).toBe(
      'Bearer session-token',
    )
    expect(sessionStorage.getItem('taskflow.accessToken')).toBeNull()
  })

  it('returns to sign in after a protected API reports an expired session', async () => {
    const fetchImpl = vi.fn()
      // 1. Login succeeds.
      .mockResolvedValueOnce(jsonResponse(200, {
        data: {
          accessToken: 'expired-token',
          user: { id: '8', name: 'Project owner', role: 'MEMBER' },
        },
      }))
      // 2. Notification unread-count request succeeds.
      .mockResolvedValueOnce(jsonResponse(200, unreadCountResponse))
      // 3. Protected projects request reports an expired session.
      .mockResolvedValueOnce(jsonResponse(401, {
        error: {
          code: 'INVALID_TOKEN',
          message: 'Authentication token expired',
        },
      }))

    vi.stubGlobal('fetch', fetchImpl)

    render(<App />)

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'owner@example.com' },
    })

    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'Passw0rdOK' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    // Wait until the expired-token projects request is made.
    await waitFor(() => {
      const projectRequest = fetchImpl.mock.calls.find(([url]) =>
        String(url).includes('/projects?'),
      )

      expect(projectRequest).toBeDefined()
      expect(projectRequest[1].headers.Authorization).toBe(
        'Bearer expired-token',
      )
    })

    // The application should clear the expired session.
    expect(
      await screen.findByRole('heading', { name: 'Welcome back' }),
    ).toBeInTheDocument()

    expect(sessionStorage.getItem('taskflow.accessToken')).toBeNull()
  })

  it('keeps the session visible and reports an error if logout cannot reach the server', async () => {
    const fetchImpl = vi.fn()
      // 1. Login succeeds.
      .mockResolvedValueOnce(jsonResponse(200, {
        data: {
          accessToken: 'session-token',
          user: { id: '8', name: 'Project owner', role: 'MEMBER' },
        },
      }))
      // 2. Notification unread-count request succeeds.
      .mockResolvedValueOnce(jsonResponse(200, unreadCountResponse))
      // 3. Projects request succeeds.
      .mockResolvedValueOnce(jsonResponse(200, projectListResponse))
      // 4. Logout request fails because the server is offline.
      .mockRejectedValueOnce(new Error('offline'))

    vi.stubGlobal('fetch', fetchImpl)

    render(<App />)

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'owner@example.com' },
    })

    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'Passw0rdOK' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(
      await screen.findByRole('heading', { name: 'Your projects' }),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The API server could not be reached',
    )

    expect(
      screen.getByRole('heading', { name: 'Your projects' }),
    ).toBeInTheDocument()

    expect(sessionStorage.getItem('taskflow.accessToken')).toBe(
      'session-token',
    )
  })
})
