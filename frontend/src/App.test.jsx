import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import App from './App'

function jsonResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  }
}

describe('App authentication integration', () => {
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
      return jsonResponse(200, {
        data: [],
        pagination: { page: 1, limit: 20, total: 0 },
      })
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

    expect(await screen.findByRole('heading', { name: 'Your projects' })).toBeInTheDocument()
    await waitFor(() => {
      expect(requests.some(({ url }) => url.endsWith('/projects?page=1&limit=20'))).toBe(true)
    })
    const projectRequest = requests.find(({ url }) => url.includes('/projects?'))
    expect(projectRequest.options.headers.Authorization).toContain('session-token')

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
    const logoutRequest = requests.find(({ url }) => url.endsWith('/auth/logout'))
    expect(logoutRequest.options.headers.Authorization).toContain('session-token')
  })

  it('returns to sign in after a protected API reports an expired session', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse(200, {
        data: {
          accessToken: 'expired-token',
          user: { id: '8', name: 'Project owner', role: 'MEMBER' },
        },
      }))
      .mockResolvedValueOnce(jsonResponse(401, {
        error: { code: 'INVALID_TOKEN', message: 'Authentication token expired' },
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

    await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2))
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
  })

  it('keeps the session visible and reports an error if logout cannot reach the server', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse(200, {
        data: {
          accessToken: 'session-token',
          user: { id: '8', name: 'Project owner', role: 'MEMBER' },
        },
      }))
      .mockResolvedValueOnce(jsonResponse(200, {
        data: [],
        pagination: { page: 1, limit: 20, total: 0 },
      }))
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
    expect(await screen.findByRole('heading', { name: 'Your projects' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The API server could not be reached',
    )
    expect(screen.getByRole('heading', { name: 'Your projects' })).toBeInTheDocument()
  })
})
