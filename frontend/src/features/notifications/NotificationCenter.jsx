
import { useEffect, useState } from 'react'

const PAGE_SIZE = 10

function isRead(notification) {
  return notification.is_read === true
    || notification.is_read === 1
    || notification.is_read === '1'
}

function formatDate(value) {
  if (!value) return ''

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return ''

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function NotificationCenter({ api }) {
  const [isOpen, setIsOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [activeAction, setActiveAction] = useState(null)

  // Fetch the initial unread count.
  useEffect(() => {
    let active = true

    api.getUnreadNotificationCount()
      .then((response) => {
        if (active) {
          setUnreadCount(Number(response.data.count) || 0)
        }
      })
      .catch(() => {
        // Keep the default count if the request fails.
      })

    return () => {
      active = false
    }
  }, [api])

  // Load notifications and unread count when the panel opens.
  async function loadNotifications() {
    setLoading(true)
    setLoadError('')
    setActionError('')

    try {
      const [listResponse, countResponse] = await Promise.all([
        api.listNotifications({
          page: 1,
          limit: PAGE_SIZE,
        }),
        api.getUnreadNotificationCount(),
      ])

      setNotifications(listResponse.data)
      setUnreadCount(Number(countResponse.data.count) || 0)
    } catch (error) {
      setLoadError(error.message || 'Unable to load notifications.')
    } finally {
      setLoading(false)
    }
  }

  // Open or close the notification panel.
  function togglePanel() {
    const nextOpen = !isOpen

    setIsOpen(nextOpen)

    if (nextOpen) {
      loadNotifications()
    }
  }

  // Mark one notification as read.
  async function markAsRead(notification) {
    if (isRead(notification) || activeAction !== null) {
      return
    }

    setActiveAction(`read-${notification.id}`)
    setActionError('')

    try {
      await api.markNotificationAsRead(notification.id)

      setNotifications((current) => current.map((item) => (
        item.id === notification.id
          ? { ...item, is_read: true }
          : item
      )))

      setUnreadCount((current) => Math.max(0, current - 1))
    } catch (error) {
      setActionError(
        error.message || 'Could not mark notification as read.',
      )
    } finally {
      setActiveAction(null)
    }
  }

  // Mark all notifications as read.
  async function markAllAsRead() {
    if (unreadCount === 0 || activeAction !== null) {
      return
    }

    setActiveAction('all')
    setActionError('')

    try {
      await api.markAllNotificationsAsRead()

      setNotifications((current) => current.map((item) => ({
        ...item,
        is_read: true,
      })))

      setUnreadCount(0)
    } catch (error) {
      setActionError(
        error.message || 'Could not mark all notifications as read.',
      )
    } finally {
      setActiveAction(null)
    }
  }

  return (
    <div className="notification-center">
      {/* Notification bell */}
      <button
        type="button"
        className="notification-trigger"
        aria-label={`Notifications, ${unreadCount} unread`}
        aria-expanded={isOpen}
        aria-controls="notification-panel"
        onClick={togglePanel}
      >
        <span className="notification-bell" aria-hidden="true">
          🔔
        </span>

        <span className="notification-trigger-label">
          Notifications
        </span>

        {unreadCount > 0 && (
          <span className="notification-count">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Notification dropdown */}
      {isOpen && (
        <section
          className="notification-panel"
          id="notification-panel"
          aria-label="Notifications"
        >
          {/* Header */}
          <div className="notification-panel-heading">
            <div>
              <h2>Notifications</h2>

              <p>
                {unreadCount === 0
                  ? 'You are all caught up.'
                  : `${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}`}
              </p>
            </div>

            <button
              type="button"
              className="notification-close"
              aria-label="Close notifications"
              onClick={() => setIsOpen(false)}
            >
              ×
            </button>
          </div>

          {/* Mark all as read */}
          {unreadCount > 0 && (
            <div className="notification-actions">
              <button
                type="button"
                className="text-button"
                disabled={activeAction !== null}
                onClick={markAllAsRead}
              >
                {activeAction === 'all'
                  ? 'Marking...'
                  : 'Mark all as read'}
              </button>
            </div>
          )}

          {/* Action error */}
          {actionError && (
            <p className="notification-error" role="alert">
              {actionError}
            </p>
          )}

          {/* Loading */}
          {loading && (
            <p className="notification-state" role="status">
              Loading notifications...
            </p>
          )}

          {/* Load error */}
          {!loading && loadError && (
            <div
              className="notification-state notification-error"
              role="alert"
            >
              <p>{loadError}</p>

              <button
                type="button"
                className="secondary-button"
                onClick={loadNotifications}
              >
                Try again
              </button>
            </div>
          )}

          {/* Empty state */}
          {!loading && !loadError && notifications.length === 0 && (
            <p className="notification-state">
              No notifications yet.
            </p>
          )}

          {/* Notification list */}
          {!loading && !loadError && notifications.length > 0 && (
            <ul className="notification-list">
              {notifications.map((notification) => {
                const read = isRead(notification)
                const busy = activeAction === `read-${notification.id}`

                return (
                  <li
                    className={`notification-item ${
                      read ? 'is-read' : 'is-unread'
                    }`}
                    key={notification.id}
                  >
                    <div className="notification-item-content">
                      <div className="notification-item-heading">
                        <strong>{notification.title}</strong>

                        {!read && (
                          <span
                            className="notification-unread-dot"
                            aria-label="Unread"
                          />
                        )}
                      </div>

                      <p>{notification.message}</p>

                      <time dateTime={notification.created_at}>
                        {formatDate(notification.created_at)}
                      </time>
                    </div>

                    {!read && (
                      <button
                        type="button"
                        className="notification-read-button"
                        disabled={activeAction !== null}
                        onClick={() => markAsRead(notification)}
                      >
                        {busy ? 'Saving...' : 'Mark read'}
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}

export default NotificationCenter
