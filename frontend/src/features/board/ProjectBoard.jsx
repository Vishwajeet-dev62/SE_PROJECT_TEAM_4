import { useEffect, useState } from 'react'
import TaskComments from '../comments/TaskComments'

const PAGE_SIZE = 50
const COLUMNS = [
  { status: 'TODO', label: 'To Do' },
  { status: 'IN_PROGRESS', label: 'In Progress' },
  { status: 'DONE', label: 'Done' },
]

function ProjectBoard({ api, project }) {
  const [result, setResult] = useState(null)
  const [page, setPage] = useState(1)
  const [updatingTask, setUpdatingTask] = useState(null)
  const [actionError, setActionError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [selectedTask, setSelectedTask] = useState(null)
  const requestKey = `${project.id}:${page}:${reloadKey}`

  useEffect(() => {
    let active = true
    api.getBoard(project.id, { page, limit: PAGE_SIZE })
      .then((response) => {
        if (!active) return
        setResult({
          key: requestKey,
          board: response.data,
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
  const board = currentResult?.board || { TODO: [], IN_PROGRESS: [], DONE: [] }
  const pagination = currentResult?.pagination || {
    page,
    limit: PAGE_SIZE,
    total: 0,
  }
  const error = actionError || currentResult?.error || ''

  async function changeStatus(taskId, status) {
    if (project.archived || updatingTask === taskId) return
    const task = Object.values(board).flat().find((item) => item.id === taskId)
    if (task?.permissions?.canEdit === false) return
    if (task?.status === status) return
    setUpdatingTask(taskId)
    setActionError('')
    try {
      await api.updateTaskStatus(taskId, status)
      setReloadKey((key) => key + 1)
    } catch (updateError) {
      setActionError(updateError.message)
    } finally {
      setUpdatingTask(null)
    }
  }

  function dropTask(event, status) {
    event.preventDefault()
    const taskId = event.dataTransfer.getData('text/plain')
    if (taskId) void changeStatus(taskId, status)
  }

  const pageCount = Math.max(1, Math.ceil(pagination.total / pagination.limit))

  return (
    <section aria-label="Project Kanban board">
      <div className="board-toolbar">
        <p className="muted">
          {pagination.total} active tasks · Drag cards or use each card’s status menu.
        </p>
        <div className="pagination" aria-label="Board pages">
          <button
            className="secondary-button"
            disabled={page <= 1 || loading}
            onClick={() => setPage((current) => current - 1)}
          >
            Previous
          </button>
          <span>Page {pagination.page} of {pageCount}</span>
          <button
            className="secondary-button"
            disabled={page >= pageCount || loading}
            onClick={() => setPage((current) => current + 1)}
          >
            Next
          </button>
        </div>
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
          Reload board
        </button>
      )}
      {loading && <p className="state-message" role="status">Loading board…</p>}
      {!loading && !error && pagination.total === 0 && (
        <div className="state-card empty-state">
          <h2>No tasks in this project</h2>
          <p>Tasks created through the shared task API will appear here.</p>
        </div>
      )}
      {!loading && !error && pagination.total > 0 && (
        <div className="board-columns">
          {COLUMNS.map((column) => (
            <section
              className="board-column"
              key={column.status}
              aria-labelledby={`column-${column.status}`}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => dropTask(event, column.status)}
            >
              <div className="column-heading">
                <h2 id={`column-${column.status}`}>{column.label}</h2>
                <span>{board[column.status].length}</span>
              </div>
              <div className="column-cards">
                {board[column.status].map((task) => (
                  <article
                    className="task-card"
                    key={task.id}
                    draggable={
                      !project.archived &&
                      task.permissions?.canEdit !== false &&
                      updatingTask !== task.id
                    }
                    onDragStart={(event) => event.dataTransfer.setData('text/plain', task.id)}
                  >
                    <div className="task-card-heading">
                      <h3>{task.title}</h3>
                      <span className={`priority priority-${task.priority.toLowerCase()}`}>
                        {task.priority}
                      </span>
                    </div>
                    {task.description && <p>{task.description}</p>}
                    {task.dueDate && <small className="due-date">Due {task.dueDate}</small>}
                    <div className="task-card-actions">
                      <label className="visually-hidden" htmlFor={`status-${task.id}`}>
                        Change status for {task.title}
                      </label>
                      <select
                        id={`status-${task.id}`}
                        value={task.status}
                        disabled={
                          project.archived ||
                          task.permissions?.canEdit === false ||
                          updatingTask === task.id
                        }
                        onChange={(event) => changeStatus(task.id, event.target.value)}
                      >
                        <option value="TODO">To Do</option>
                        <option value="IN_PROGRESS">In Progress</option>
                        <option value="DONE">Done</option>
                      </select>
                      <button
                        className="text-button"
                        onClick={() => setSelectedTask(task)}
                        aria-label={`View comments for ${task.title}`}
                      >
                        Comments
                      </button>
                    </div>
                  </article>
                ))}
                {board[column.status].length === 0 && (
                  <p className="column-empty">No tasks in this column.</p>
                )}
              </div>
            </section>
          ))}
        </div>
      )}

      {selectedTask && (
        <TaskComments
          api={api}
          task={selectedTask}
          project={project}
          onClose={() => setSelectedTask(null)}
        />
      )}
    </section>
  )
}

export default ProjectBoard
