
import { useEffect, useMemo, useRef, useState } from 'react'
import { createApiClient } from './api/client'
import AuthScreen from './features/auth/AuthScreen'
import ProjectList from './features/projects/ProjectList'
import ProjectWorkspace from './features/projects/ProjectWorkspace'
import './App.css'

const SESSION_KEY = 'taskflow.accessToken'

function getStoredSession() {
  try {
    const accessToken = sessionStorage.getItem(SESSION_KEY)
    return accessToken ? { accessToken, user: null } : null
  } catch {
    return null
  }
}

function clearStoredSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY)
  } catch {
    // Storage may be unavailable in restricted browser environments.
  }
}

function App() {
  const [session, setSession] = useState(getStoredSession)
  const [projectId, setProjectId] = useState(null)
  const [authError, setAuthError] = useState('')

  const [isRestoringSession, setIsRestoringSession] = useState(
    () => Boolean(getStoredSession()?.accessToken),
  )

  const initialAccessToken = useRef(session?.accessToken || null)
  const sessionRestorePromise = useRef(null)

  const accessToken = session?.accessToken

  const api = useMemo(() => createApiClient({
    tokenProvider: () => accessToken || null,

    onUnauthorized: () => {
      clearStoredSession()
      setSession(null)
      setProjectId(null)
    },
  }), [accessToken])

  // Restore and validate a session saved before the page was refreshed.
  useEffect(() => {
    const token = initialAccessToken.current

    if (!token) {
      setIsRestoringSession(false)
      return undefined
    }

    let active = true

    // Reuse the same request across React StrictMode effect executions.
    if (!sessionRestorePromise.current) {
      sessionRestorePromise.current = api.getCurrentUser()
    }

    sessionRestorePromise.current
      .then((response) => {
        if (!active) return

        setSession((current) => (
          current?.accessToken === token
            ? {
                accessToken: token,
                user: response.data.user,
              }
            : current
        ))
      })
      .catch(() => {
        if (!active) return

        clearStoredSession()

        setSession((current) => (
          current?.accessToken === token ? null : current
        ))
      })
      .finally(() => {
        if (active) {
          setIsRestoringSession(false)
        }
      })

    return () => {
      active = false
    }
  }, [api])

  async function logout() {
    setAuthError('')

    try {
      await api.logout()

      clearStoredSession()
      setSession(null)
      setProjectId(null)
    } catch (error) {
      if (error.status !== 401) {
        setAuthError(error.message)
      }
    }
  }

  function handleAuthenticated(authenticatedSession) {
    try {
      sessionStorage.setItem(
        SESSION_KEY,
        authenticatedSession.accessToken,
      )
    } catch {
      setAuthError('Could not save your session in this browser.')
      return
    }

    setAuthError('')
    setSession(authenticatedSession)
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <a
          className="brand"
          href="/"
          aria-label="Task Manager home"
          onClick={(event) => {
            event.preventDefault()
            setProjectId(null)
          }}
        >
          <span className="brand-mark" aria-hidden="true">
            ✓
          </span>
          <span>Task Manager</span>
        </a>

        {session?.user && (
          <div className="account-actions">
            <span className="account-name">
              {session.user.name}
            </span>

            <button
              className="text-button"
              onClick={logout}
            >
              Sign out
            </button>
          </div>
        )}

        {session?.user && projectId && (
          <button
            className="text-button"
            onClick={() => setProjectId(null)}
          >
            All projects
          </button>
        )}
      </header>

      <main className="main-content">
        {isRestoringSession ? (
          <p className="state-message" role="status">
            Restoring your session…
          </p>
        ) : !session?.user ? (
          <AuthScreen
            api={api}
            onAuthenticated={handleAuthenticated}
          />
        ) : (
          <>
            {authError && (
              <p className="error-message" role="alert">
                {authError}
              </p>
            )}

            {projectId ? (
              <ProjectWorkspace
                api={api}
                projectId={projectId}
                onBack={() => setProjectId(null)}
              />
            ) : (
              <ProjectList
                api={api}
                onOpenProject={setProjectId}
              />
            )}
          </>
        )}
      </main>
    </div>
  )
}

export default App
