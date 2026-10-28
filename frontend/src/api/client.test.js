import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiRequestError, createApiClient } from './client'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('API client', () => {
  it('uses the configured base URL, query parameters, and bearer token', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [], pagination: { page: 1, limit: 20, total: 0 } }),
    })
    const client = createApiClient({
      baseUrl: 'https://api.example.test/api/v1/',
      fetchImpl,
      tokenProvider: async () => 'session-token',
    })

    await client.listProjects({ page: 2, limit: 10 })

    const [url, options] = fetchImpl.mock.calls[0]
    expect(url.toString()).toBe(
      'https://api.example.test/api/v1/projects?page=2&limit=10',
    )
    expect(options.headers.Authorization).toBe('Bearer session-token')
    expect(options.headers['Content-Type']).toBeUndefined()
  })

  it('serializes JSON bodies and returns null for no-content responses', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({ data: { id: '1' } }) })
      .mockResolvedValueOnce({ ok: true, status: 204 })
    const client = createApiClient({
      baseUrl: 'http://localhost:3000/api/v1',
      fetchImpl,
    })

    await client.createProject({ name: 'Sprint' })
    const response = await client.removeMember('1', '2')

    expect(fetchImpl.mock.calls[0][1].headers['Content-Type']).toBe('application/json')
    expect(fetchImpl.mock.calls[0][1].body).toBe('{"name":"Sprint"}')
    expect(response).toBeNull()
  })

  it('clears the authenticated session on an unauthorized API response', async () => {
    const onUnauthorized = vi.fn()
    const client = createApiClient({
      baseUrl: 'http://localhost:3000/api/v1',
      fetchImpl: vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({
          error: { code: 'SESSION_REVOKED', message: 'Session ended' },
        }),
      }),
      tokenProvider: () => 'expired-session-token',
      onUnauthorized,
    })

    await expect(client.listProjects()).rejects.toMatchObject({
      status: 401,
      code: 'SESSION_REVOKED',
    })
    expect(onUnauthorized).toHaveBeenCalledOnce()
  })

  it('preserves the shared error format for failed requests', async () => {
    const client = createApiClient({
      baseUrl: 'http://localhost:3000/api/v1',
      fetchImpl: vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({
          error: {
            code: 'FORBIDDEN',
            message: 'No project access',
            details: { projectId: '1' },
          },
        }),
      }),
    })

    await expect(client.getProject('1')).rejects.toMatchObject({
      name: 'ApiRequestError',
      status: 403,
      code: 'FORBIDDEN',
      message: 'No project access',
      details: { projectId: '1' },
    })
  })

  it('surfaces network and invalid-response failures', async () => {
    const networkClient = createApiClient({
      baseUrl: 'http://localhost:3000/api/v1',
      fetchImpl: vi.fn().mockRejectedValue(new Error('offline')),
    })
    const invalidClient = createApiClient({
      baseUrl: 'http://localhost:3000/api/v1',
      fetchImpl: vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error('invalid json')
        },
      }),
    })

    await expect(networkClient.listProjects()).rejects.toBeInstanceOf(ApiRequestError)
    await expect(invalidClient.listProjects()).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    })
  })
})
