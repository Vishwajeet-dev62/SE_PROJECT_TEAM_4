
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import AuthScreen from './AuthScreen'

afterEach(() => {
  window.history.replaceState({}, '', '/')
  vi.restoreAllMocks()
})

describe('AuthScreen', () => {
  it('signs in using the authentication response and reports failures', async () => {
    const onAuthenticated = vi.fn()
    const api = {
      login: vi.fn().mockRejectedValue(new Error('Invalid email or password')),
      register: vi.fn(),
    }

    render(<AuthScreen api={api} onAuthenticated={onAuthenticated} />)

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'member@example.com' },
    })
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'Passw0rdOK' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Invalid email or password',
    )

    expect(api.login).toHaveBeenCalledWith({
      email: 'member@example.com',
      password: 'Passw0rdOK',
    })

    expect(onAuthenticated).not.toHaveBeenCalled()
  })

  it('registers then signs in without persisting the access token', async () => {
    const authenticatedSession = {
      accessToken: 'memory-only-token',
      user: { id: '5', name: 'Member', role: 'MEMBER' },
    }

    const onAuthenticated = vi.fn()
    const api = {
      register: vi.fn().mockResolvedValue({
        data: { user: authenticatedSession.user },
      }),
      login: vi.fn().mockResolvedValue({
        data: authenticatedSession,
      }),
    }

    render(<AuthScreen api={api} onAuthenticated={onAuthenticated} />)

    fireEvent.click(
      screen.getByRole('button', { name: 'Create an account' }),
    )

    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Member' },
    })
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'member@example.com' },
    })
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'Passw0rdOK' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))

    await waitFor(() => {
      expect(api.login).toHaveBeenCalledWith({
        email: 'member@example.com',
        password: 'Passw0rdOK',
      })
    })

    expect(api.register).toHaveBeenCalledWith({
      name: 'Member',
      email: 'member@example.com',
      password: 'Passw0rdOK',
    })

    expect(onAuthenticated).toHaveBeenCalledWith(authenticatedSession)
    expect(localStorage.getItem('accessToken')).toBeNull()
  })

  it('requests a password reset using the entered email', async () => {
    const api = {
      requestPasswordReset: vi.fn().mockResolvedValue({
        data: {
          message: 'If an account exists, a reset link has been sent.',
        },
      }),
    }

    render(<AuthScreen api={api} onAuthenticated={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }))

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'member@example.com' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }))

    expect(await screen.findByRole('status')).toHaveTextContent(
      'If an account exists, a reset link has been sent.',
    )

    expect(api.requestPasswordReset).toHaveBeenCalledWith({
      email: 'member@example.com',
    })
  })

  it('reports password reset request failures', async () => {
    const api = {
      requestPasswordReset: vi.fn().mockRejectedValue(
        new Error('Unable to process request'),
      ),
    }

    render(<AuthScreen api={api} onAuthenticated={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }))

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'member@example.com' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to process request',
    )
  })

  it('resets the password using the token from the reset URL', async () => {
    window.history.replaceState(
      {},
      '',
      '/reset-password?token=valid-reset-token',
    )

    const api = {
      resetPassword: vi.fn().mockResolvedValue({
        data: { message: 'Password has been reset.' },
      }),
    }

    render(<AuthScreen api={api} onAuthenticated={vi.fn()} />)

    expect(screen.getByLabelText('Reset token')).toHaveValue(
      'valid-reset-token',
    )

    fireEvent.change(screen.getByLabelText('New password'), {
      target: { value: 'NewPassw0rd' },
    })

    fireEvent.change(screen.getByLabelText('Confirm new password'), {
      target: { value: 'NewPassw0rd' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Reset password' }))

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Password has been reset.',
    )

    expect(api.resetPassword).toHaveBeenCalledWith({
      token: 'valid-reset-token',
      newPassword: 'NewPassw0rd',
    })

    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
  })

  it('does not submit when the new passwords do not match', async () => {
    window.history.replaceState(
      {},
      '',
      '/reset-password?token=valid-reset-token',
    )

    const api = {
      resetPassword: vi.fn(),
    }

    render(<AuthScreen api={api} onAuthenticated={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('New password'), {
      target: { value: 'NewPassw0rd' },
    })

    fireEvent.change(screen.getByLabelText('Confirm new password'), {
      target: { value: 'DifferentPass1' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Reset password' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Passwords do not match.',
    )

    expect(api.resetPassword).not.toHaveBeenCalled()
  })
})
