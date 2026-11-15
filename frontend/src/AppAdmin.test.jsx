
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

function jsonResponse(status, payload) {
  return { ok: status >= 200 && status < 300, status, json: async () => payload }
}

function stubApi(role) {
  const requests = []
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    const target = String(url)
    requests.push(target)
    if (target.endsWith('/auth/me')) {
      return jsonResponse(200, { data: { user: { id: '1', name: 'Pat', role } } })
    }
    if (target.includes('/admin/users')) {
      return jsonResponse(200, {
        data: [{ id: '1', name: 'Pat', email: 'pat@example.com', role, active: true }],
        pagination: { page: 1, limit: 20, total: 1 },
      })
    }
    if (target.includes('/projects?')) {
      return jsonResponse(200, { data: [], pagination: { page: 1, limit: 20, total: 0 } })
    }
    if (target.endsWith('/notifications/unread-count')) {
      return jsonResponse(200, { data: { count: 0 } })
    }
    return jsonResponse(404, { error: { message: 'Not found' } })
  }))
  return requests
}

describe('App administration navigation', () => {
  beforeEach(() => {
    sessionStorage.setItem('taskflow.accessToken', 'saved-token')
  })

  afterEach(() => {
    sessionStorage.clear()
    vi.unstubAllGlobals()
  })

  it('shows the Administration screen to administrators and can return to projects', async () => {
    const requests = stubApi('ADMIN')
    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: 'Administration' }))

    expect(await screen.findByRole('heading', { name: 'Users' })).toBeInTheDocument()
    expect(requests.some((url) => url.includes('/admin/users'))).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Administration' }))
    expect(await screen.findByRole('heading', { name: 'Your projects' })).toBeInTheDocument()
  })

  it('never offers Administration to members and sends no admin requests', async () => {
    const requests = stubApi('MEMBER')
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Your projects' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Administration' })).not.toBeInTheDocument()
    expect(requests.some((url) => url.includes('/admin/'))).toBe(false)
  })
})
