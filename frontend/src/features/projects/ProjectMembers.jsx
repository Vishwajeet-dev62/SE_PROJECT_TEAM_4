import { useEffect, useState } from 'react'

const PAGE_SIZE = 20

function ProjectMembers({ api, project }) {
  const [result, setResult] = useState(null)
  const [page, setPage] = useState(1)
  const [userId, setUserId] = useState('')
  const [saving, setSaving] = useState(false)
  const [actionError, setActionError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const requestKey = `${project.id}:${page}:${reloadKey}`

  useEffect(() => {
    let active = true
    api.listMembers(project.id, { page, limit: PAGE_SIZE })
      .then((response) => {
        if (!active) return
        setResult({
          key: requestKey,
          members: response.data,
          pagination: response.pagination,
        })
      })
      .catch((loadError) => {
        if (active) setResult({ key: requestKey, error: loadError.message })
      })

    return () => {
      active = false
    }
  }, [api, project.id, page, reloadKey, requestKey])

  const currentResult = result?.key === requestKey ? result : null
  const loading = currentResult === null
  const members = currentResult?.members || []
  const pagination = currentResult?.pagination || {
    page,
    limit: PAGE_SIZE,
    total: 0,
  }
  const error = actionError || currentResult?.error || ''

  async function addMember(event) {
    event.preventDefault()
    setSaving(true)
    setActionError('')
    try {
      await api.addMember(project.id, userId)
      setUserId('')
      setPage(1)
      setReloadKey((key) => key + 1)
    } catch (saveError) {
      setActionError(saveError.message)
    } finally {
      setSaving(false)
    }
  }

  async function removeMember(member) {
    if (!window.confirm(`Remove ${member.name} from this project?`)) return
    setActionError('')
    try {
      await api.removeMember(project.id, member.id)
      setReloadKey((key) => key + 1)
    } catch (removeError) {
      setActionError(removeError.message)
    }
  }

  return (
    <section className="panel members-panel" aria-labelledby="members-heading">
      <div className="section-heading">
        <div>
          <h2 id="members-heading">Project members</h2>
          <p className="muted">{pagination.total} members, including the owner.</p>
        </div>
      </div>

      {project.permissions?.canManage && !project.archived && (
        <form className="inline-form" onSubmit={addMember}>
          <label htmlFor="member-user-id">Add member by user ID</label>
          <div className="inline-form-controls">
            <input
              id="member-user-id"
              inputMode="numeric"
              pattern="[1-9][0-9]*"
              maxLength={20}
              required
              value={userId}
              onChange={(event) => setUserId(event.target.value)}
            />
            <button className="primary-button" type="submit" disabled={saving}>
              {saving ? 'Adding…' : 'Add member'}
            </button>
          </div>
        </form>
      )}

      {error && <p className="error-message" role="alert">{error}</p>}
      {error && !loading && (
        <button
          className="secondary-button"
          onClick={() => {
            setActionError('')
            setReloadKey((key) => key + 1)
          }}
        >
          Try again
        </button>
      )}
      {loading && <p className="state-message" role="status">Loading members…</p>}
      {!loading && !error && members.length === 0 && (
        <p className="empty-copy">No members are available for this page.</p>
      )}
      {!loading && members.length > 0 && (
        <ul className="member-list">
          {members.map((member) => (
            <li className="member-row" key={member.id}>
              <span className="avatar" aria-hidden="true">
                {member.name?.trim().charAt(0).toUpperCase() || '?'}
              </span>
              <span className="member-name">
                <strong>{member.name}</strong>
                <small>{member.role === 'OWNER' ? 'Project owner' : 'Member'}</small>
              </span>
              {member.role !== 'OWNER' && project.permissions?.canManage && !project.archived && (
                <button
                  className="text-button danger-text"
                  onClick={() => removeMember(member)}
                  aria-label={`Remove ${member.name}`}
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <nav className="pagination" aria-label="Member pages">
        <button
          className="secondary-button"
          disabled={page <= 1 || loading}
          onClick={() => setPage((current) => current - 1)}
        >
          Previous
        </button>
        <span>Page {pagination.page} of {Math.max(1, Math.ceil(pagination.total / pagination.limit))}</span>
        <button
          className="secondary-button"
          disabled={page >= Math.max(1, Math.ceil(pagination.total / pagination.limit)) || loading}
          onClick={() => setPage((current) => current + 1)}
        >
          Next
        </button>
      </nav>
    </section>
  )
}

export default ProjectMembers
