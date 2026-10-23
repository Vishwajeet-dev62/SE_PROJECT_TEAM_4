import { useState } from 'react'
import { apiClient } from './api/client'
import ProjectList from './features/projects/ProjectList'
import ProjectWorkspace from './features/projects/ProjectWorkspace'
import './App.css'

function App() {
  const [projectId, setProjectId] = useState(null)

  return (
    <div className="app-shell">
      <header className="app-header">
        <a className="brand" href="/" aria-label="Task Manager home" onClick={(event) => {
          event.preventDefault()
          setProjectId(null)
        }}>
          <span className="brand-mark" aria-hidden="true">✓</span>
          <span>Task Manager</span>
        </a>
        {projectId && (
          <button className="text-button" onClick={() => setProjectId(null)}>
            All projects
          </button>
        )}
      </header>
      <main className="main-content">
        {projectId ? (
          <ProjectWorkspace
            api={apiClient}
            projectId={projectId}
            onBack={() => setProjectId(null)}
          />
        ) : (
          <ProjectList api={apiClient} onOpenProject={setProjectId} />
        )}
      </main>
    </div>
  )
}

export default App
