
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import NotificationCenter from './NotificationCenter'

const notifications = [
  {
    id: '1',
    title: 'Task assigned',
    message: 'A new task was assigned to you.',
    type: 'TASK_ASSIGNED',
    is_read: false,
    created_at: '2026-11-10T10:00:00.000Z',
  },
  {
    id: '2',
    title: 'New comment',
    message: 'Someone commented on your task.',
    type: 'COMMENT_ADDED',
    is_read: true,
    created_at: '2026-11-10T09:00:00.000Z',
  },
]

function createApi(overrides = {}) {
  return {
    listNotifications: vi.fn().mockResolvedValue({
      data: notifications,
      pagination: { page: 1, limit: 10, total: 2 },
    }),
    getUnreadNotificationCount: vi.fn().mockResolvedValue({
      data: { count: 1 },
    }),
    markNotificationAsRead: vi.fn().mockResolvedValue({
      data: { ...notifications[0], is_read: true },
    }),
    markAllNotificationsAsRead: vi.fn().mockResolvedValue({
      data: { updatedCount: 1 },
    }),
    ...overrides,
  }
}

describe('NotificationCenter', () => {
  it('loads the unread count and notifications when opened', async () => {
    const api = createApi()

    render(<NotificationCenter api={api} />)

    expect(await screen.findByRole('button', {
      name: 'Notifications, 1 unread',
    })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', {
      name: 'Notifications, 1 unread',
    }))

    expect(await screen.findByText('Task assigned')).toBeInTheDocument()
    expect(screen.getByText('New comment')).toBeInTheDocument()
    expect(api.listNotifications).toHaveBeenCalledWith({
      page: 1,
      limit: 10,
    })
  })

  it('marks an individual notification as read', async () => {
    const api = createApi()

    render(<NotificationCenter api={api} />)

    fireEvent.click(await screen.findByRole('button', {
      name: 'Notifications, 1 unread',
    }))

    expect(await screen.findByText('Task assigned')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Mark read' }))

    await waitFor(() => {
      expect(api.markNotificationAsRead).toHaveBeenCalledWith('1')
    })

    expect(await screen.findByRole('button', {
      name: 'Notifications, 0 unread',
    })).toBeInTheDocument()
  })

  it('marks all notifications as read', async () => {
    const api = createApi()

    render(<NotificationCenter api={api} />)

    fireEvent.click(await screen.findByRole('button', {
      name: 'Notifications, 1 unread',
    }))

    fireEvent.click(await screen.findByRole('button', {
      name: 'Mark all as read',
    }))

    await waitFor(() => {
      expect(api.markAllNotificationsAsRead).toHaveBeenCalled()
    })

    expect(await screen.findByRole('button', {
      name: 'Notifications, 0 unread',
    })).toBeInTheDocument()
  })

  it('shows an empty state when there are no notifications', async () => {
    const api = createApi({
      listNotifications: vi.fn().mockResolvedValue({
        data: [],
        pagination: { page: 1, limit: 10, total: 0 },
      }),
      getUnreadNotificationCount: vi.fn().mockResolvedValue({
        data: { count: 0 },
      }),
    })

    render(<NotificationCenter api={api} />)

    fireEvent.click(await screen.findByRole('button', {
      name: 'Notifications, 0 unread',
    }))

    expect(await screen.findByText('No notifications yet.')).toBeInTheDocument()
  })

  it('shows an error and allows retry when loading fails', async () => {
    const api = createApi({
      listNotifications: vi.fn()
        .mockRejectedValueOnce(new Error('Unable to load notifications'))
        .mockResolvedValueOnce({
          data: notifications,
          pagination: { page: 1, limit: 10, total: 2 },
        }),
    })

    render(<NotificationCenter api={api} />)

    fireEvent.click(await screen.findByRole('button', {
      name: 'Notifications, 1 unread',
    }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to load notifications',
    )

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('Task assigned')).toBeInTheDocument()
  })
})
