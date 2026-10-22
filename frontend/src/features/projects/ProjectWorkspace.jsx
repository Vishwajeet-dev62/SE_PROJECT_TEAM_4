import { useEffect, useState } from 'react'
import ProjectBoard from '../board/ProjectBoard'
import ProjectDashboard from '../dashboard/ProjectDashboard'
import ProjectMembers from './ProjectMembers'

const VIEWS = [
  { id: 'dashboard', label: 'Overview' },
  { id: 'board', label: 'Board' },
  { id: 'members', label: 'Members' },
]

function ProjectWorkspace({ api, projectId, onBack }) {
  const [projectResult, setProjectResult] = useState(null)
  const [view, setView] = useState('dashboard')
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const requestKey = projectId

  useEffect(() => {
    let active = true
    api.getProject(projectId)
      .then((response) => {
        if (!active) return
        setProjectResult({ key: requestKey, project: response.data })
        setName(response.data.name)
        setDescription(response.data.description || '')
      })
      .catch((loadError) => {
        if (active) setProjectResult({ key: requestKey, error: loadError.message })
      })

    return () => {
      active = false
    }
  }, [api, projectId, requestKey])

  const currentResult = projectResult?.key === requestKey ? projectResult : null
  const loading = currentResult === null
  const error = currentResult?.error || ''
  const project = currentResult?.project

  async function saveProject(event) {
    event.preventDefault()
    setSaving(true)
    setFormError('')
    try {
      const response = await api.updateProject(project.id, { name, description })
      setProjectResult({ key: requestKey, project: response.data })
      setEditing(false)
    } catch (saveError) {
      setFormError(saveError.message)
    } finally {
      setSaving(false)
    }
  }

  async function archiveProject() {
    if (!window.confirm(`Archive "${project.name}"? The project will become read-only.`)) {
      return
    }
    setFormError('')
    try {
      const response = await api.archiveProject(project.id)
      setProjectResult({ key: requestKey, project: response.data })
      setEditing(false)
    } catch (archiveError) {
      setFormError(archiveError.message)
    }
  }

  if (loading) return <p className="state-message" role="status">Loading project…</p>
  if (error) {
    return (
      <div className="state-card error-state" role="alert">
        <h1>Project could not be opened</h1>
        <p>{error}</p>
        <button className="secondary-button" onClick={onBack}>Back to projects</button>
      </div>
    )
  }
  if (!project) return null

  return (
    <section className="workspace" aria-labelledby="project-title">
      <div className="workspace-heading">
        <div>
          <button className="back-link" onClick={onBack}>← All projects</button>
          <div className="title-row">
            <h1 id="project-title">{project.name}</h1>
            {project.archived && <span className="badge">Archived · read only</span>}
          </div>
          <p className="muted">{project.description || 'No project description.'}</p>
        </div>
        {project.permissions?.canManage && !project.archived && (
          <button
            className="secondary-button"
            onClick={() => {
              if (!editing) {
                setName(project.name)
                setDescription(project.description || '')
              }
              setEditing((current) => !current)
              setFormError('')
            }}
          >
            {editing ? 'Cancel edit' : 'Edit project'}
          </button>
        )}
        {project.permissions?.canArchive && !project.archived && (
          <button className="danger-button" onClick={archiveProject}>
            Archive
          </button>
        )}
      </div>

      {formError && <p className="error-message" role="alert">{formError}</p>}
      {editing && (
        <form className="panel form-panel" onSubmit={saveProject}>
          <h2>Edit project</h2>
          <label>
            Project name
            <input
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
          <button className="primary-button" type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </form>
      )}

      <nav className="view-tabs" aria-label="Project sections">
        {VIEWS.map((item) => (
          <button
            key={item.id}
            className={view === item.id ? 'view-tab selected' : 'view-tab'}
            aria-current={view === item.id ? 'page' : undefined}
            onClick={() => setView(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {view === 'dashboard' && (
        <ProjectDashboard api={api} projectId={project.id} />
      )}
      {view === 'board' && (
        <ProjectBoard api={api} project={project} />
      )}
      {view === 'members' && (
        <ProjectMembers api={api} project={project} />
      )}
    </section>
  )
}

export default ProjectWorkspace
