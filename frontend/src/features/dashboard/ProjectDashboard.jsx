import { useEffect, useState } from 'react'

function ProjectDashboard({ api, projectId }) {
  const [result, setResult] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)
  const requestKey = `${projectId}:${reloadKey}`

  useEffect(() => {
    let active = true
    api.getDashboard(projectId)
      .then((response) => {
        if (active) setResult({ key: requestKey, dashboard: response.data })
      })
      .catch((loadError) => {
        if (active) setResult({ key: requestKey, error: loadError.message })
      })

    return () => {
      active = false
    }
  }, [api, projectId, reloadKey, requestKey])

  const currentResult = result?.key === requestKey ? result : null
  const loading = currentResult === null
  const error = currentResult?.error || ''
  const dashboard = currentResult?.dashboard
  if (loading) return <p className="state-message" role="status">Loading project progress…</p>
  if (error) {
    return (
      <div className="state-card error-state" role="alert">
        <h2>Dashboard could not be loaded</h2>
        <p>{error}</p>
        <button className="secondary-button" onClick={() => setReloadKey((key) => key + 1)}>
          Try again
        </button>
      </div>
    )
  }
  if (!dashboard) return null

  const { countsByStatus, percentComplete, overdue } = dashboard
  const total = countsByStatus.TODO + countsByStatus.IN_PROGRESS + countsByStatus.DONE

  return (
    <section aria-label="Project dashboard">
      <div className="stats-grid">
        <StatCard label="Total tasks" value={total} tone="purple" />
        <StatCard label="To do" value={countsByStatus.TODO} tone="orange" />
        <StatCard label="In progress" value={countsByStatus.IN_PROGRESS} tone="blue" />
        <StatCard label="Done" value={countsByStatus.DONE} tone="green" />
      </div>
      <div className="dashboard-grid">
        <article className="panel completion-panel">
          <div className="section-heading">
            <div>
              <h2>Project completion</h2>
              <p className="muted">Completed tasks as a share of active project tasks.</p>
            </div>
            <strong className="completion-value">{percentComplete}%</strong>
          </div>
          <progress
            className="completion-progress"
            max="100"
            value={percentComplete}
            aria-label="Project completion"
            aria-valuetext={`${percentComplete}% complete`}
          />
          <p className="muted">{countsByStatus.DONE} of {total} tasks complete</p>
        </article>
        <article className="panel overdue-panel">
          <p className="eyebrow">NEEDS ATTENTION</p>
          <h2>Overdue tasks</h2>
          <strong className="overdue-count">{overdue}</strong>
          <p className="muted">Unfinished tasks with a due date before today (UTC).</p>
        </article>
      </div>
    </section>
  )
}

function StatCard({ label, value, tone }) {
  return (
    <article className="stat-card">
      <span className={`stat-indicator ${tone}`} aria-hidden="true" />
      <p>{label}</p>
      <strong>{value}</strong>
    </article>
  )
}

export default ProjectDashboard
