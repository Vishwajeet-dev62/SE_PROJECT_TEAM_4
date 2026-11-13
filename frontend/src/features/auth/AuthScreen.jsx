
import { useState } from 'react'

function getInitialAuthState() {
  if (typeof window === 'undefined') {
    return { mode: 'login', token: '' }
  }

  const isResetRoute = window.location.pathname.replace(/\/+$/, '') === '/reset-password'
  const token = new URLSearchParams(window.location.search).get('token') || ''

  return {
    mode: isResetRoute ? 'reset-password' : 'login',
    token,
  }
}

function AuthScreen({ api, onAuthenticated }) {
  const [initialState] = useState(getInitialAuthState)
  const [mode, setMode] = useState(initialState.mode)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [resetToken, setResetToken] = useState(initialState.token)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const isRegistering = mode === 'register'
  const isForgotPassword = mode === 'forgot-password'
  const isResetPassword = mode === 'reset-password'

  async function submit(event) {
    event.preventDefault()
    setError('')
    setSuccess('')
    setSubmitting(true)

    try {
      if (isForgotPassword) {
        const response = await api.requestPasswordReset({ email })

        setSuccess(
          response?.data?.message ||
          'If an account exists with that email, a password reset link has been sent.',
        )
        return
      }

      if (isResetPassword) {
        if (password !== confirmPassword) {
          setError('Passwords do not match.')
          return
        }

        const response = await api.resetPassword({
          token: resetToken,
          newPassword: password,
        })

        setSuccess(
          response?.data?.message || 'Your password has been reset successfully.',
        )
        setPassword('')
        setConfirmPassword('')
        setResetToken('')
        setMode('login')

        window.history.replaceState({}, '', '/')
        return
      }

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
    setSuccess('')
    setPassword('')
    setConfirmPassword('')
  }

  return (
    <section className="auth-page" aria-labelledby="auth-heading">
      <div className="auth-card">
        <p className="eyebrow">TASK MANAGER</p>

        <h1 id="auth-heading">
          {isRegistering
            ? 'Create your account'
            : isForgotPassword
              ? 'Forgot your password?'
              : isResetPassword
                ? 'Reset your password'
                : 'Welcome back'}
        </h1>

        <p className="muted">
          {isRegistering
            ? 'Create an account to start managing your team projects.'
            : isForgotPassword
              ? 'Enter your email address and we will send you a password reset link if an account exists.'
              : isResetPassword
                ? 'Enter your reset token and choose a new password.'
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

          {(isForgotPassword || !isResetPassword) && (
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
          )}

          {isResetPassword && (
            <label>
              Reset token
              <input
                autoComplete="off"
                required
                value={resetToken}
                onChange={(event) => setResetToken(event.target.value)}
              />
            </label>
          )}

          {!isForgotPassword && (
            <label>
              {isResetPassword ? 'New password' : 'Password'}
              <input
                autoComplete={
                  isRegistering || isResetPassword
                    ? 'new-password'
                    : 'current-password'
                }
                minLength={isRegistering || isResetPassword ? 8 : undefined}
                type="password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
          )}

          {isResetPassword && (
            <label>
              Confirm new password
              <input
                autoComplete="new-password"
                minLength={8}
                type="password"
                required
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
            </label>
          )}

          {isRegistering && (
            <p className="form-hint">
              Use at least 8 characters with letters and digits.
            </p>
          )}

          {isResetPassword && (
            <p className="form-hint">
              Use at least 8 characters with letters and digits.
            </p>
          )}

          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}

          {success && (
            <p className="form-hint" role="status">
              {success}
            </p>
          )}

          <button
            className="primary-button"
            type="submit"
            disabled={submitting}
          >
            {submitting
              ? 'Please wait...'
              : isRegistering
                ? 'Create account'
                : isForgotPassword
                  ? 'Send reset link'
                  : isResetPassword
                    ? 'Reset password'
                    : 'Sign in'}
          </button>
        </form>

        {!isRegistering && !isForgotPassword && !isResetPassword && (
          <p className="auth-switch">
            <button
              className="text-button"
              type="button"
              onClick={() => changeMode('forgot-password')}
            >
              Forgot password?
            </button>
          </p>
        )}

        {isRegistering && (
          <p className="auth-switch">
            Already have an account?{' '}
            <button
              className="text-button"
              type="button"
              onClick={() => changeMode('login')}
            >
              Sign in
            </button>
          </p>
        )}

        {!isRegistering && !isResetPassword && !isForgotPassword && (
          <p className="auth-switch">
            New to Task Manager?{' '}
            <button
              className="text-button"
              type="button"
              onClick={() => changeMode('register')}
            >
              Create an account
            </button>
          </p>
        )}

        {(isForgotPassword || isResetPassword) && (
          <p className="auth-switch">
            Remembered your password?{' '}
            <button
              className="text-button"
              type="button"
              onClick={() => changeMode('login')}
            >
              Back to sign in
            </button>
          </p>
        )}

        {!isForgotPassword && !isResetPassword && (
          <p className="form-hint">
            Your session is saved for this browser tab and cleared when you
            sign out or the session expires.
          </p>
        )}
      </div>
    </section>
  )
}

export default AuthScreen
