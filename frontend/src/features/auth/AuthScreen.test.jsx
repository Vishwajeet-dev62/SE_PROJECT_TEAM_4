import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import AuthScreen from './AuthScreen'

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
      register: vi.fn().mockResolvedValue({ data: { user: authenticatedSession.user } }),
      login: vi.fn().mockResolvedValue({ data: authenticatedSession }),
    }

    render(<AuthScreen api={api} onAuthenticated={onAuthenticated} />)
    fireEvent.click(screen.getByRole('button', { name: 'Create an account' }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Member' } })
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
})
