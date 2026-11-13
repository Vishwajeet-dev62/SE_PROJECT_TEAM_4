
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
    // --------------------------------
    // Authentication
    // --------------------------------

    register: (body) => request('/auth/register', {
      method: 'POST',
      body,
    }),

    login: (body) => request('/auth/login', {
      method: 'POST',
      body,
    }),

    logout: () => request('/auth/logout', {
      method: 'POST',
    }),

    getCurrentUser: () => request('/auth/me'),

    requestPasswordReset: (body) => request('/auth/forgot-password', {
      method: 'POST',
      body,
    }),

    resetPassword: (body) => request('/auth/reset-password', {
      method: 'POST',
      body,
    }),

    // --------------------------------
    // Projects
    // --------------------------------

    listProjects: (query) => request('/projects', { query }),

    getProject: (id) => request(
      `/projects/${encodeURIComponent(id)}`,
    ),

    createProject: (body) => request('/projects', {
      method: 'POST',
      body,
    }),

    updateProject: (id, body) => request(
      `/projects/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        body,
      },
    ),

    archiveProject: (id) => request(
      `/projects/${encodeURIComponent(id)}/archive`,
      {
        method: 'POST',
      },
    ),

    // --------------------------------
    // Project Members
    // --------------------------------

    listMembers: (id, query) => request(
      `/projects/${encodeURIComponent(id)}/members`,
      { query },
    ),

    addMember: (id, userId) => request(
      `/projects/${encodeURIComponent(id)}/members`,
      {
        method: 'POST',
        body: { userId },
      },
    ),

    removeMember: (id, userId) => request(
      `/projects/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}`,
      {
        method: 'DELETE',
      },
    ),

    // --------------------------------
    // Project Categories
    // --------------------------------

    listCategories: (projectId) => request(
      `/projects/${encodeURIComponent(projectId)}/categories`,
    ),

    createCategory: (projectId, name) => request(
      `/projects/${encodeURIComponent(projectId)}/categories`,
      {
        method: 'POST',
        body: { name },
      },
    ),

    updateCategory: (projectId, categoryId, name) => request(
      `/projects/${encodeURIComponent(projectId)}/categories/${encodeURIComponent(categoryId)}`,
      {
        method: 'PATCH',
        body: { name },
      },
    ),

    deleteCategory: (projectId, categoryId) => request(
      `/projects/${encodeURIComponent(projectId)}/categories/${encodeURIComponent(categoryId)}`,
      {
        method: 'DELETE',
      },
    ),

    // --------------------------------
    // Project Tags
    // --------------------------------

    listTags: (projectId) => request(
      `/projects/${encodeURIComponent(projectId)}/tags`,
    ),

    createTag: (projectId, name) => request(
      `/projects/${encodeURIComponent(projectId)}/tags`,
      {
        method: 'POST',
        body: { name },
      },
    ),

    updateTag: (projectId, tagId, name) => request(
      `/projects/${encodeURIComponent(projectId)}/tags/${encodeURIComponent(tagId)}`,
      {
        method: 'PATCH',
        body: { name },
      },
    ),

    deleteTag: (projectId, tagId) => request(
      `/projects/${encodeURIComponent(projectId)}/tags/${encodeURIComponent(tagId)}`,
      {
        method: 'DELETE',
      },
    ),

    // --------------------------------
    // Dashboard and Kanban Board
    // --------------------------------

    getDashboard: (id) => request(
      `/projects/${encodeURIComponent(id)}/dashboard`,
    ),

    getBoard: (id, query) => request(
      `/projects/${encodeURIComponent(id)}/board`,
      { query },
    ),

    // --------------------------------
    // Task Management
    // --------------------------------

    listTasks: (projectId, query) => request(
      `/projects/${encodeURIComponent(projectId)}/tasks`,
      { query },
    ),

    createTask: (projectId, body) => request(
      `/projects/${encodeURIComponent(projectId)}/tasks`,
      {
        method: 'POST',
        body,
      },
    ),

    getTask: (id) => request(
      `/tasks/${encodeURIComponent(id)}`,
    ),

    updateTask: (id, body) => request(
      `/tasks/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        body,
      },
    ),

    deleteTask: (id) => request(
      `/tasks/${encodeURIComponent(id)}`,
      {
        method: 'DELETE',
      },
    ),

    listDeletedTasks: (projectId, query) => request(
      `/projects/${encodeURIComponent(projectId)}/tasks/trash`,
      { query },
    ),

    restoreTask: (id) => request(
      `/tasks/${encodeURIComponent(id)}/restore`,
      {
        method: 'POST',
      },
    ),

    updateTaskStatus: (id, status) => request(
      `/tasks/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        body: { status },
      },
    ),

    assignTask: (id, userId) => request(
      `/tasks/${encodeURIComponent(id)}/assignment`,
      {
        method: 'PATCH',
        body: { assigned_to: userId },
      },
    ),

    // --------------------------------
    // Task Comments
    // --------------------------------

    listComments: (taskId, query) => request(
      `/tasks/${encodeURIComponent(taskId)}/comments`,
      { query },
    ),

    createComment: (taskId, body) => request(
      `/tasks/${encodeURIComponent(taskId)}/comments`,
      {
        method: 'POST',
        body: { body },
      },
    ),

    updateComment: (id, body) => request(
      `/comments/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        body: { body },
      },
    ),

    deleteComment: (id) => request(
      `/comments/${encodeURIComponent(id)}`,
      {
        method: 'DELETE',
      },
    ),

    // --------------------------------
    // Notifications
    // --------------------------------

    listNotifications: (query) => request('/notifications', { query }),

    getUnreadNotificationCount: () => request('/notifications/unread-count'),

    markNotificationAsRead: (id) => request(
      `/notifications/${encodeURIComponent(id)}/read`,
      {
        method: 'PATCH',
      },
    ),

    markAllNotificationsAsRead: () => request('/notifications/read-all', {
      method: 'PATCH',
    }),
  }
}

export const apiClient = createApiClient()
