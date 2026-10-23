import { useEffect, useState } from 'react'

const PAGE_SIZE = 20

function ProjectList({ api, onOpenProject }) {
  const [result, setResult] = useState(null)
  const [page, setPage] = useState(1)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const requestKey = `${page}:${reloadKey}`

  useEffect(() => {
    let active = true

    api.listProjects({ page, limit: PAGE_SIZE })
      .then((response) => {
        if (active) {
          setResult({
            key: requestKey,
            projects: response.data,
            pagination: response.pagination,
          })
        }
      })
      .catch((error) => {
        if (active) setResult({ key: requestKey, error: error.message })
      })

    return () => {
      active = false
    }
  }, [api, page, reloadKey, requestKey])

  const currentResult = result?.key === requestKey ? result : null
  const loading = currentResult === null
  const projects = currentResult?.projects || []
  const pagination = currentResult?.pagination || {
    page,
    limit: PAGE_SIZE,
    total: 0,
  }
  const loadError = currentResult?.error || ''

  async function createProject(event) {
    event.preventDefault()
    setFormError('')
    setSaving(true)
    try {
      const response = await api.createProject({ name, description })
      onOpenProject(response.data.id)
    } catch (error) {
      setFormError(error.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="page-section" aria-labelledby="projects-heading">
      <div className="page-heading">
        <div>
          <p className="eyebrow">WORKSPACE</p>
          <h1 id="projects-heading">Your projects</h1>
          <p className="muted">Open a project to review its board, progress, and members.</p>
        </div>
        <button
          className="primary-button"
          type="button"
          onClick={() => {
            setShowForm((current) => !current)
            setFormError('')
          }}
        >
          {showForm ? 'Cancel' : 'Create project'}
        </button>
      </div>

      {showForm && (
        <form className="panel form-panel" onSubmit={createProject}>
          <h2>New project</h2>
          <label>
            Project name
            <input
              autoFocus
              required
              maxLength={150}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label>
            Description
            <textarea
              rows={3}
              maxLength={5000}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          {formError && <p className="error-message" role="alert">{formError}</p>}
          <button className="primary-button" type="submit" disabled={saving}>
            {saving ? 'Creating…' : 'Create project'}
          </button>
        </form>
      )}

      {loading && <p className="state-message" role="status">Loading projects…</p>}
      {!loading && loadError && (
        <div className="state-card error-state" role="alert">
          <h2>Projects could not be loaded</h2>
          <p>{loadError}</p>
          <button className="secondary-button" onClick={() => setReloadKey((key) => key + 1)}>
            Try again
          </button>
        </div>
      )}
      {!loading && !loadError && projects.length === 0 && (
        <div className="state-card empty-state">
          <span className="empty-icon" aria-hidden="true">▦</span>
          <h2>No projects yet</h2>
          <p>Create a project to start organizing team work.</p>
        </div>
      )}
      {!loading && !loadError && projects.length > 0 && (
        <>
          <div className="project-grid">
            {projects.map((project) => (
              <button
                className="project-card"
                key={project.id}
                onClick={() => onOpenProject(project.id)}
              >
                <span className="project-card-icon" aria-hidden="true">▦</span>
                <span className="project-card-copy">
                  <strong>{project.name}</strong>
                  <span>{project.description || 'No description provided.'}</span>
                </span>
                {project.archived && <span className="badge">Archived</span>}
                <span className="project-arrow" aria-hidden="true">→</span>
              </button>
            ))}
          </div>
          <Pagination
            pagination={pagination}
            onPageChange={setPage}
          />
        </>
      )}
    </section>
  )
}

function Pagination({ pagination, onPageChange }) {
  const pageCount = Math.max(1, Math.ceil(pagination.total / pagination.limit))
  return (
    <nav className="pagination" aria-label="Project pages">
      <button
        className="secondary-button"
        disabled={pagination.page <= 1}
        onClick={() => onPageChange((current) => current - 1)}
      >
        Previous
      </button>
      <span>Page {pagination.page} of {pageCount}</span>
      <button
        className="secondary-button"
        disabled={pagination.page >= pageCount}
        onClick={() => onPageChange((current) => current + 1)}
      >
        Next
      </button>
    </nav>
  )
}

export default ProjectList
