const DEFAULT_API_BASE_URL = 'http://localhost:3000/api/v1'

export class ApiRequestError extends Error {
  constructor(status, code, message, details, options) {
    super(message, options)
    this.name = 'ApiRequestError'
    this.status = status
    this.code = code
    this.details = details
  }
}

export function createApiClient({
  baseUrl = import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL,
  fetchImpl = globalThis.fetch,
  tokenProvider = () => null,
  onUnauthorized = () => {},
} = {}) {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '')

  async function request(path, { method = 'GET', body, query } = {}) {
    const url = new URL(`${normalizedBaseUrl}${path}`)
    for (const [key, value] of Object.entries(query || {})) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value))
      }
    }

    const headers = { Accept: 'application/json' }
    const accessToken = await tokenProvider()
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`
    }
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json'
    }

    let response
    try {
      response = await fetchImpl(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    } catch (error) {
      throw new ApiRequestError(
        0,
        'NETWORK_ERROR',
        'The API server could not be reached',
        undefined,
        { cause: error },
      )
    }

    if (response.status === 204) {
      return null
    }

    let payload
    try {
      payload = await response.json()
    } catch (error) {
      throw new ApiRequestError(
        response.status,
        'INVALID_RESPONSE',
        'The API returned an invalid response',
        undefined,
        { cause: error },
      )
    }

    if (!response.ok) {
      if (response.status === 401) {
        onUnauthorized()
      }
      const apiError = payload?.error
      throw new ApiRequestError(
        response.status,
        apiError?.code || 'REQUEST_FAILED',
        apiError?.message || 'The request could not be completed',
        apiError?.details,
      )
    }

    return payload
  }

  return {
    register: (body) => request('/auth/register', { method: 'POST', body }),
    login: (body) => request('/auth/login', { method: 'POST', body }),
    logout: () => request('/auth/logout', { method: 'POST' }),
    getCurrentUser: () => request('/auth/me'),
    listProjects: (query) => request('/projects', { query }),
    getProject: (id) => request(`/projects/${encodeURIComponent(id)}`),
    createProject: (body) => request('/projects', { method: 'POST', body }),
    updateProject: (id, body) => request(`/projects/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body,
    }),
    archiveProject: (id) => request(
      `/projects/${encodeURIComponent(id)}/archive`,
      { method: 'POST' },
    ),
    listMembers: (id, query) => request(
      `/projects/${encodeURIComponent(id)}/members`,
      { query },
    ),
    addMember: (id, userId) => request(
      `/projects/${encodeURIComponent(id)}/members`,
      { method: 'POST', body: { userId } },
    ),
    removeMember: (id, userId) => request(
      `/projects/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}`,
      { method: 'DELETE' },
    ),
    getDashboard: (id) => request(
      `/projects/${encodeURIComponent(id)}/dashboard`,
    ),
    getBoard: (id, query) => request(
      `/projects/${encodeURIComponent(id)}/board`,
      { query },
    ),
    listComments: (taskId, query) => request(
      `/tasks/${encodeURIComponent(taskId)}/comments`,
      { query },
    ),
    createComment: (taskId, body) => request(
      `/tasks/${encodeURIComponent(taskId)}/comments`,
      { method: 'POST', body: { body } },
    ),
    updateComment: (id, body) => request(
      `/comments/${encodeURIComponent(id)}`,
      { method: 'PATCH', body: { body } },
    ),
    deleteComment: (id) => request(
      `/comments/${encodeURIComponent(id)}`,
      { method: 'DELETE' },
    ),
    updateTaskStatus: (id, status) => request(
      `/tasks/${encodeURIComponent(id)}`,
      { method: 'PATCH', body: { status } },
    ),
  }
}

export const apiClient = createApiClient()
