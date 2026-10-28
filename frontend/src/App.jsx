import { useMemo, useState } from 'react'
import { createApiClient } from './api/client'
import AuthScreen from './features/auth/AuthScreen'
import ProjectList from './features/projects/ProjectList'
import ProjectWorkspace from './features/projects/ProjectWorkspace'
import './App.css'

function App() {
  const [projectId, setProjectId] = useState(null)
  const [session, setSession] = useState(null)
  const [authError, setAuthError] = useState('')
  const accessToken = session?.accessToken
  const api = useMemo(() => createApiClient({
    tokenProvider: () => accessToken || null,
    onUnauthorized: () => {
      setSession(null)
      setProjectId(null)
    },
  }), [accessToken])

  async function logout() {
    setAuthError('')
    try {
      await api.logout()
      setSession(null)
      setProjectId(null)
    } catch (error) {
      if (error.status !== 401) setAuthError(error.message)
    }
  }

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
        {session && (
          <div className="account-actions">
            <span className="account-name">{session.user.name}</span>
            <button className="text-button" onClick={logout}>Sign out</button>
          </div>
        )}
        {session && projectId && (
          <button className="text-button" onClick={() => setProjectId(null)}>
            All projects
          </button>
        )}
      </header>
      <main className="main-content">
        {!session ? (
          <AuthScreen
            api={api}
            onAuthenticated={(authenticatedSession) => {
              setAuthError('')
              setSession(authenticatedSession)
            }}
          />
        ) : (
          <>
            {authError && <p className="error-message" role="alert">{authError}</p>}
            {projectId ? (
              <ProjectWorkspace
                api={api}
                projectId={projectId}
                onBack={() => setProjectId(null)}
              />
            ) : (
              <ProjectList api={api} onOpenProject={setProjectId} />
            )}
          </>
        )}
      </main>
    </div>
  )
}

export default App
