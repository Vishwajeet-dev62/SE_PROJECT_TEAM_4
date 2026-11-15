
import { useEffect, useState } from 'react'

const PAGE_SIZE = 20
const ROLES = ['MEMBER', 'ADMIN']
const EMPTY_FORM = { name: '', email: '', password: '', role: 'MEMBER' }

function AdminUsers({ api, currentUser }) {
  const [users, setUsers] = useState([])
  const [pagination, setPagination] = useState({
    page: 1,
    limit: PAGE_SIZE,
    total: 0,
  })
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [notice, setNotice] = useState('')
  const [pendingId, setPendingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [creating, setCreating] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  // State is set only in the promise callbacks. `active` ignores a response
  // that arrives after a newer request (or after the screen closed).
  useEffect(() => {
    let active = true

    api.listUsers({ page, limit: PAGE_SIZE })
      .then((response) => {
        if (!active) return

        setUsers(response.data)
        setPagination(response.pagination)
        setLoadError('')
      })
      .catch((error) => {
        if (active) setLoadError(error.message)
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [api, page, reloadKey])

  function showPage(nextPage) {
    setLoading(true)
    setPage(nextPage)
  }

  const totalPages = Math.max(
    1,
    Math.ceil(pagination.total / (pagination.limit || PAGE_SIZE)),
  )

  async function updateUser(user, request, message) {
    setActionError('')
    setNotice('')
    setPendingId(user.id)

    try {
      const response = await request()

      setUsers((current) => current.map((item) => (
        item.id === user.id ? { ...item, ...response.data } : item
      )))
      setNotice(message)
    } catch (error) {
      setActionError(error.message)
    } finally {
      setPendingId(null)
    }
  }

  function changeRole(user, role) {
    if (role === user.role) return

    updateUser(
      user,
      () => api.setUserRole(user.id, role),
      `${user.name} is now ${role === 'ADMIN' ? 'an administrator' : 'a member'}.`,
    )
  }

  function toggleActive(user) {
    updateUser(
      user,
      () => api.setUserStatus(user.id, !user.active),
      `${user.name} was ${user.active ? 'deactivated' : 'activated'}.`,
    )
  }

  function changeField(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function createUser(event) {
    event.preventDefault()
    setActionError('')
    setNotice('')
    setCreating(true)

    try {
      const response = await api.createUser({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        role: form.role,
      })

      setForm(EMPTY_FORM)
      setNotice(`Created the account for ${response.data.name}.`)

      setLoading(true)
      setPage(1)
      setReloadKey((current) => current + 1)
    } catch (error) {
      setActionError(error.message)
    } finally {
      setCreating(false)
    }
  }

  return (
    <section className="workspace admin-users" aria-labelledby="admin-heading">
      <div className="workspace-heading">
        <div>
          <p className="eyebrow">ADMINISTRATION</p>
          <h1 id="admin-heading">Users</h1>
        </div>
      </div>

      {notice && (
        <p className="form-hint" role="status">
          {notice}
        </p>
      )}

      {actionError && (
        <p className="error-message" role="alert">
          {actionError}
        </p>
      )}

      <form
        className="form-panel admin-create-form"
        onSubmit={createUser}
        aria-label="Create a user"
      >
        <h2>Create a user</h2>
        <p className="muted">
          Set a first password and share it with the person; they should
          change it after signing in.
        </p>

        <label>
          Name
          <input
            value={form.name}
            onChange={(event) => changeField('name', event.target.value)}
            maxLength={100}
            required
          />
        </label>

        <label>
          Email
          <input
            type="email"
            value={form.email}
            onChange={(event) => changeField('email', event.target.value)}
            required
          />
        </label>

        <label>
          First password
          <input
            type="password"
            value={form.password}
            onChange={(event) => changeField('password', event.target.value)}
            autoComplete="new-password"
            required
          />
          <span className="form-hint">
            Use at least 8 characters with letters and digits.
          </span>
        </label>

        <label>
          Role
          <select
            value={form.role}
            onChange={(event) => changeField('role', event.target.value)}
          >
            {ROLES.map((role) => (
              <option key={role} value={role}>{role}</option>
            ))}
          </select>
        </label>

        <button
          className="primary-button"
          type="submit"
          disabled={creating}
        >
          {creating ? 'Creating…' : 'Create user'}
        </button>
      </form>

      <div className="panel">
        {loading && (
          <p className="state-message" role="status">Loading users…</p>
        )}

        {loadError && (
          <p className="error-message" role="alert">{loadError}</p>
        )}

        {!loading && !loadError && users.length === 0 && (
          <p className="state-message">No users found.</p>
        )}

        {!loadError && users.length > 0 && (
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Email</th>
                <th scope="col">Role</th>
                <th scope="col">Status</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const isSelf = String(user.id) === String(currentUser.id)
                const busy = pendingId === user.id

                return (
                  <tr key={user.id}>
                    <td>
                      {user.name}
                      {isSelf && <span className="muted"> (you)</span>}
                    </td>
                    <td>{user.email}</td>
                    <td>
                      <select
                        aria-label={`Role for ${user.name}`}
                        value={user.role}
                        disabled={isSelf || busy}
                        onChange={(event) => changeRole(user, event.target.value)}
                      >
                        {ROLES.map((role) => (
                          <option key={role} value={role}>{role}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <span className="badge">
                        {user.active ? 'Active' : 'Deactivated'}
                      </span>
                    </td>
                    <td>
                      <button
                        className={user.active ? 'danger-button' : 'secondary-button'}
                        aria-label={`${user.active ? 'Deactivate' : 'Activate'} ${user.name}`}
                        disabled={isSelf || busy}
                        title={isSelf ? 'You cannot change your own account' : undefined}
                        onClick={() => toggleActive(user)}
                      >
                        {user.active ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}

        <nav className="pagination-bar" aria-label="Users pages">
          <button
            className="secondary-button"
            disabled={loading || page <= 1}
            onClick={() => showPage(page - 1)}
          >
            Previous
          </button>

          <span className="muted">
            Page {pagination.page} of {totalPages}
          </span>

          <button
            className="secondary-button"
            disabled={loading || page >= totalPages}
            onClick={() => showPage(page + 1)}
          >
            Next
          </button>
        </nav>
      </div>
    </section>
  )
}

export default AdminUsers
