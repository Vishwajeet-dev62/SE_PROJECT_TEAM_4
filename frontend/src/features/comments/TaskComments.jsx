import { useEffect, useState } from 'react'

const PAGE_SIZE = 20

function TaskComments({ api, task, project, onClose }) {
  const [result, setResult] = useState(null)
  const [page, setPage] = useState(1)
  const [body, setBody] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editingBody, setEditingBody] = useState('')
  const [saving, setSaving] = useState(false)
  const [actionError, setActionError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const requestKey = `${task.id}:${page}:${reloadKey}`

  useEffect(() => {
    let active = true
    api.listComments(task.id, { page, limit: PAGE_SIZE })
      .then((response) => {
        if (!active) return
        setResult({
          key: requestKey,
          comments: response.data,
          pagination: response.pagination,
        })
      })
      .catch((loadError) => {
        if (active) setResult({ key: requestKey, error: loadError.message })
      })

    return () => {
      active = false
    }
  }, [api, task.id, page, reloadKey, requestKey])

  const currentResult = result?.key === requestKey ? result : null
  const loading = currentResult === null
  const comments = currentResult?.comments || []
  const pagination = currentResult?.pagination || {
    page,
    limit: PAGE_SIZE,
    total: 0,
  }
  const error = actionError || currentResult?.error || ''

  async function addComment(event) {
    event.preventDefault()
    setSaving(true)
    setActionError('')
    try {
      await api.createComment(task.id, body)
      setBody('')
      setPage(1)
      setReloadKey((key) => key + 1)
    } catch (saveError) {
      setActionError(saveError.message)
    } finally {
      setSaving(false)
    }
  }

  async function saveEdit(commentId) {
    setSaving(true)
    setActionError('')
    try {
      await api.updateComment(commentId, editingBody)
      setEditingId(null)
      setEditingBody('')
      setPage(1)
      setReloadKey((key) => key + 1)
    } catch (saveError) {
      setActionError(saveError.message)
    } finally {
      setSaving(false)
    }
  }

  async function deleteComment(comment) {
    if (!window.confirm('Delete this comment?')) return
    setActionError('')
    try {
      await api.deleteComment(comment.id)
      setReloadKey((key) => key + 1)
    } catch (deleteError) {
      setActionError(deleteError.message)
    }
  }

  return (
    <aside className="comments-panel panel" aria-label={`Comments for ${task.title}`}>
      <div className="section-heading">
        <div>
          <p className="eyebrow">TASK DISCUSSION</p>
          <h2>{task.title}</h2>
        </div>
        <button className="text-button" onClick={onClose} aria-label="Close comments">
          Close
        </button>
      </div>

      {error && <p className="error-message" role="alert">{error}</p>}
      {error && !loading && (
        <button
          className="secondary-button"
          onClick={() => {
            setActionError('')
            setReloadKey((key) => key + 1)
          }}
        >
          Reload comments
        </button>
      )}
      {loading && <p className="state-message" role="status">Loading comments…</p>}
      {!loading && comments.length === 0 && (
        <p className="empty-copy">No comments yet.</p>
      )}
      {!loading && comments.length > 0 && (
        <ul className="comment-list">
          {comments.map((comment) => (
            <li className="comment-item" key={comment.id}>
              <div className="comment-meta">
                <strong>{comment.authorName}</strong>
                <time dateTime={comment.createdAt}>
                  {new Date(comment.createdAt).toLocaleString()}
                </time>
              </div>
              {editingId === comment.id ? (
                <div className="comment-edit-form">
                  <label className="visually-hidden" htmlFor={`comment-edit-${comment.id}`}>
                    Edit comment
                  </label>
                  <textarea
                    id={`comment-edit-${comment.id}`}
                    maxLength={5000}
                    rows={3}
                    value={editingBody}
                    onChange={(event) => setEditingBody(event.target.value)}
                  />
                  <button
                    type="button"
                    className="primary-button"
                    disabled={saving || !editingBody.trim()}
                    onClick={() => saveEdit(comment.id)}
                  >
                    Save
                  </button>
                  <button type="button" className="secondary-button" onClick={() => setEditingId(null)}>
                    Cancel
                  </button>
                </div>
              ) : (
                <p className="comment-body">{comment.body}</p>
              )}
              <div className="comment-actions">
                {comment.permissions?.canEdit && editingId !== comment.id && (
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => {
                      setEditingId(comment.id)
                      setEditingBody(comment.body)
                    }}
                  >
                    Edit
                  </button>
                )}
                {comment.permissions?.canDelete && (
                  <button
                    type="button"
                    className="text-button danger-text"
                    onClick={() => deleteComment(comment)}
                  >
                    Delete
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <nav className="pagination" aria-label="Comment pages">
        <button
          className="secondary-button"
          disabled={page <= 1 || loading}
          onClick={() => setPage((current) => current - 1)}
        >
          Previous
        </button>
        <span>
          Page {pagination.page} of {Math.max(1, Math.ceil(pagination.total / pagination.limit))}
        </span>
        <button
          className="secondary-button"
          disabled={page >= Math.max(1, Math.ceil(pagination.total / pagination.limit)) || loading}
          onClick={() => setPage((current) => current + 1)}
        >
          Next
        </button>
      </nav>
      {!project.archived && (
        <form className="comment-form" onSubmit={addComment}>
          <label htmlFor="new-comment">Add a comment</label>
          <textarea
            id="new-comment"
            maxLength={5000}
            rows={3}
            required
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
          <button className="primary-button" type="submit" disabled={saving || !body.trim()}>
            {saving ? 'Saving…' : 'Post comment'}
          </button>
        </form>
      )}
      {project.archived && (
        <p className="readonly-note">Archived projects are read-only.</p>
      )}
    </aside>
  )
}

export default TaskComments
