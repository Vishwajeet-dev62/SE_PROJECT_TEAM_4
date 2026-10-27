import { useState } from 'react'

function AuthScreen({ api, onAuthenticated }) {
  const [mode, setMode] = useState('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const isRegistering = mode === 'register'

  async function submit(event) {
    event.preventDefault()
    setError('')
    setSubmitting(true)

    try {
      if (isRegistering) {
        await api.register({ name, email, password })
      }
      const response = await api.login({ email, password })
      onAuthenticated(response.data)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  function changeMode(nextMode) {
    setMode(nextMode)
    setError('')
  }

  return (
    <section className="auth-page" aria-labelledby="auth-heading">
      <div className="auth-card">
        <p className="eyebrow">TASK MANAGER</p>
        <h1 id="auth-heading">{isRegistering ? 'Create your account' : 'Welcome back'}</h1>
        <p className="muted">
          {isRegistering
            ? 'Create an account to start managing your team projects.'
            : 'Sign in to access your projects and team workspace.'}
        </p>
        <form className="form-panel auth-form" onSubmit={submit}>
          {isRegistering && (
            <label>
              Name
              <input
                autoComplete="name"
                maxLength={100}
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
          )}
          <label>
            Email
            <input
              autoComplete="email"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label>
            Password
            <input
              autoComplete={isRegistering ? 'new-password' : 'current-password'}
              minLength={isRegistering ? 8 : undefined}
              type="password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {isRegistering && (
            <p className="form-hint">Use at least 8 characters with letters and digits.</p>
          )}
          {error && <p className="error-message" role="alert">{error}</p>}
          <button className="primary-button" type="submit" disabled={submitting}>
            {submitting
              ? 'Please wait…'
              : isRegistering ? 'Create account' : 'Sign in'}
          </button>
        </form>
        <p className="auth-switch">
          {isRegistering ? 'Already have an account?' : 'New to Task Manager?'}
          {' '}
          <button
            className="text-button"
            type="button"
            onClick={() => changeMode(isRegistering ? 'login' : 'register')}
          >
            {isRegistering ? 'Sign in' : 'Create an account'}
          </button>
        </p>
        <p className="form-hint">Your sign-in token is held in memory and is cleared when you sign out or close this page.</p>
      </div>
    </section>
  )
}

export default AuthScreen
