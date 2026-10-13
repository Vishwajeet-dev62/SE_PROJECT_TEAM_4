import { useState } from 'react'
import './App.css'

const initialTasks = [
  { id: 1, title: 'Set up project structure', description: 'Prepare the application folders and development environment.', priority: 'High', status: 'Done' },
  { id: 2, title: 'Build the dashboard', description: 'Create the main Task Manager dashboard.', priority: 'High', status: 'In Progress' },
  { id: 3, title: 'Create task form', description: 'Add a form to create and manage tasks.', priority: 'Medium', status: 'To Do' },
  { id: 4, title: 'Connect the database', description: 'Persist tasks through the backend API.', priority: 'Medium', status: 'To Do' },
]

function App() {
  const [tasks, setTasks] = useState(initialTasks)
  const [filter, setFilter] = useState('All')
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [newTask, setNewTask] = useState({
    title: '', description: '', priority: 'Medium', dueDate: '',
  })

  const visibleTasks = tasks.filter((task) => {
    const matchesFilter = filter === 'All' || task.status === filter
    const matchesSearch = `${task.title} ${task.description}`
      .toLowerCase().includes(search.toLowerCase())
    return matchesFilter && matchesSearch
  })

  function createTask(event) {
    event.preventDefault()
    if (!newTask.title.trim()) return

    setTasks((current) => [
      {
        ...newTask,
        id: Date.now(),
        title: newTask.title.trim(),
        status: 'To Do',
      },
      ...current,
    ])
    setNewTask({ title: '', description: '', priority: 'Medium', dueDate: '' })
    setShowForm(false)
    setFilter('All')
  }

  function changeStatus(id, status) {
    setTasks((current) => current.map((task) =>
      task.id === id ? { ...task, status } : task
    ))
  }

  function deleteTask(id) {
    if (window.confirm('Delete this task?')) {
      setTasks((current) => current.filter((task) => task.id !== id))
    }
  }

  const counts = {
    All: tasks.length,
    'To Do': tasks.filter((task) => task.status === 'To Do').length,
    'In Progress': tasks.filter((task) => task.status === 'In Progress').length,
    Done: tasks.filter((task) => task.status === 'Done').length,
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-icon">✓</span> TaskFlow</div>
        <p className="nav-heading">WORKSPACE</p>
        <button className="nav-item active" onClick={() => setFilter('All')}>▦ <span>My Tasks</span></button>
        <button className="nav-item" onClick={() => setFilter('In Progress')}>◷ <span>In Progress</span></button>
        <button className="nav-item" onClick={() => setFilter('Done')}>✓ <span>Completed</span></button>
        <div className="sidebar-bottom">
          <div className="avatar">V</div>
          <div><strong>My Workspace</strong><small>Task Manager</small></div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <span>Workspace / <strong>My Tasks</strong></span>
          <span className="user-chip"><span className="online-dot" /> Personal workspace</span>
        </header>

        <section className="welcome">
          <div>
            <p className="eyebrow">YOUR WORKSPACE</p>
            <h1>Stay organized. Get things done.</h1>
            <p className="muted">Keep track of your tasks and make progress every day.</p>
          </div>
          <button className="primary-button" onClick={() => setShowForm(!showForm)}>
            + Create task
          </button>
        </section>

        <section className="stats-grid">
          <div className="stat-card"><span className="stat-icon purple">▦</span><p>Total tasks</p><strong>{counts.All}</strong></div>
          <div className="stat-card"><span className="stat-icon orange">◷</span><p>To do</p><strong>{counts['To Do']}</strong></div>
          <div className="stat-card"><span className="stat-icon blue">↗</span><p>In progress</p><strong>{counts['In Progress']}</strong></div>
          <div className="stat-card"><span className="stat-icon green">✓</span><p>Completed</p><strong>{counts.Done}</strong></div>
        </section>

        {showForm && (
          <form className="task-form" onSubmit={createTask}>
            <h2>Create a new task</h2>
            <label>Task title *
              <input autoFocus required value={newTask.title} onChange={(e) => setNewTask({ ...newTask, title: e.target.value })} placeholder="What needs to be done?" />
            </label>
            <label>Description
              <textarea value={newTask.description} onChange={(e) => setNewTask({ ...newTask, description: e.target.value })} placeholder="Add some details..." rows="3" />
            </label>
            <div className="form-row">
              <label>Priority
                <select value={newTask.priority} onChange={(e) => setNewTask({ ...newTask, priority: e.target.value })}>
                  <option>Low</option><option>Medium</option><option>High</option>
                </select>
              </label>
              <label>Due date
                <input type="date" value={newTask.dueDate} onChange={(e) => setNewTask({ ...newTask, dueDate: e.target.value })} />
              </label>
            </div>
            <div className="form-actions">
              <button type="button" className="secondary-button" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="primary-button" type="submit">Save task</button>
            </div>
          </form>
        )}

        <section className="tasks-section">
          <div className="section-heading">
            <div><h2>My tasks</h2><p className="muted">Manage and track your work.</p></div>
            <input className="search-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="⌕  Search tasks..." />
          </div>

          <div className="filter-row">
            {['All', 'To Do', 'In Progress', 'Done'].map((status) => (
              <button key={status} className={`filter-button ${filter === status ? 'selected' : ''}`} onClick={() => setFilter(status)}>
                {status} <span>{counts[status]}</span>
              </button>
            ))}
          </div>

          <div className="task-list">
            {visibleTasks.map((task) => (
              <article className="task-card" key={task.id}>
                <div className={`task-check ${task.status === 'Done' ? 'checked' : ''}`}>{task.status === 'Done' ? '✓' : ''}</div>
                <div className="task-details">
                  <h3 className={task.status === 'Done' ? 'completed-title' : ''}>{task.title}</h3>
                  <p>{task.description || 'No description provided.'}</p>
                  {task.dueDate && <small className="due-date">Due {task.dueDate}</small>}
                  <div className="task-tags">
                    <span className={`priority priority-${task.priority.toLowerCase()}`}>{task.priority} priority</span>
                    <span className={`status status-${task.status.toLowerCase().replace(' ', '-')}`}>{task.status}</span>
                  </div>
                </div>
                <div className="task-actions">
                  <select aria-label={`Change status for ${task.title}`} value={task.status} onChange={(e) => changeStatus(task.id, e.target.value)}>
                    <option>To Do</option><option>In Progress</option><option>Done</option>
                  </select>
                  <button className="delete-button" onClick={() => deleteTask(task.id)} aria-label={`Delete ${task.title}`}>×</button>
                </div>
              </article>
            ))}
            {visibleTasks.length === 0 && <div className="empty-state"><span>▦</span><h3>No tasks found</h3><p>Try another filter or create a new task.</p></div>}
          </div>
        </section>
        <footer>TaskFlow · Task Manager project</footer>
      </main>
    </div>
  )
}

export default App