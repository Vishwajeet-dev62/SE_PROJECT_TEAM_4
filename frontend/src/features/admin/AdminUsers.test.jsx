
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import AdminUsers from './AdminUsers'

const admin = { id: '1', name: 'Ada Admin', role: 'ADMIN' }

const users = [
  { id: '1', name: 'Ada Admin', email: 'ada@example.com', role: 'ADMIN', active: true },
  { id: '2', name: 'Ben Member', email: 'ben@example.com', role: 'MEMBER', active: true },
  { id: '3', name: 'Cy Off', email: 'cy@example.com', role: 'MEMBER', active: false },
]

function createApi(overrides = {}) {
  return {
    listUsers: vi.fn().mockResolvedValue({
      data: users,
      pagination: { page: 1, limit: 20, total: 3 },
    }),
    createUser: vi.fn().mockResolvedValue({
      data: { id: '4', name: 'New Person', email: 'new@example.com', role: 'MEMBER', active: true },
    }),
    setUserStatus: vi.fn().mockResolvedValue({ data: { ...users[1], active: false } }),
    setUserRole: vi.fn().mockResolvedValue({ data: { ...users[1], role: 'ADMIN' } }),
    ...overrides,
  }
}

describe('AdminUsers', () => {
  it('lists users with their role and status', async () => {
    const api = createApi()
    render(<AdminUsers api={api} currentUser={admin} />)

    expect(await screen.findByText('Ben Member')).toBeInTheDocument()
    expect(api.listUsers).toHaveBeenCalledWith({ page: 1, limit: 20 })
    expect(screen.getByText('ben@example.com')).toBeInTheDocument()
    expect(screen.getByText('Deactivated')).toBeInTheDocument()
    expect(screen.getByLabelText('Role for Ben Member')).toHaveValue('MEMBER')
    expect(screen.getByText('Page 1 of 1')).toBeInTheDocument()
  })

  it('does not let administrators change their own account', async () => {
    render(<AdminUsers api={createApi()} currentUser={admin} />)
    await screen.findByText('Ben Member')

    expect(screen.getByLabelText('Role for Ada Admin')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Deactivate Ada Admin' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Deactivate Ben Member' })).toBeEnabled()
  })

  it('changes a role and shows the confirmed result', async () => {
    const api = createApi()
    render(<AdminUsers api={api} currentUser={admin} />)
    await screen.findByText('Ben Member')

    fireEvent.change(screen.getByLabelText('Role for Ben Member'), {
      target: { value: 'ADMIN' },
    })

    await waitFor(() => expect(api.setUserRole).toHaveBeenCalledWith('2', 'ADMIN'))
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Ben Member is now an administrator.',
    )
    expect(screen.getByLabelText('Role for Ben Member')).toHaveValue('ADMIN')
  })

  it('deactivates and activates users', async () => {
    const api = createApi({
      setUserStatus: vi.fn()
        .mockResolvedValueOnce({ data: { ...users[1], active: false } })
        .mockResolvedValueOnce({ data: { ...users[2], active: true } }),
    })
    render(<AdminUsers api={api} currentUser={admin} />)
    await screen.findByText('Ben Member')

    fireEvent.click(screen.getByRole('button', { name: 'Deactivate Ben Member' }))
    await waitFor(() => expect(api.setUserStatus).toHaveBeenCalledWith('2', false))
    expect(await screen.findByRole('button', { name: 'Activate Ben Member' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Activate Cy Off' }))
    await waitFor(() => expect(api.setUserStatus).toHaveBeenCalledWith('3', true))
  })

  it('shows the server message when an update fails and leaves the row unchanged', async () => {
    const api = createApi({
      setUserRole: vi.fn().mockRejectedValue(
        new Error('Administrators cannot change their own role or status'),
      ),
    })
    render(<AdminUsers api={api} currentUser={admin} />)
    await screen.findByText('Ben Member')

    fireEvent.change(screen.getByLabelText('Role for Ben Member'), {
      target: { value: 'ADMIN' },
    })

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Administrators cannot change their own role or status',
    )
    expect(screen.getByLabelText('Role for Ben Member')).toHaveValue('MEMBER')
  })

  it('creates a user, clears the form and reloads the list', async () => {
    const api = createApi()
    render(<AdminUsers api={api} currentUser={admin} />)
    await screen.findByText('Ben Member')

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: ' New Person ' } })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@example.com' } })
    fireEvent.change(screen.getByLabelText(/First password/), { target: { value: 'Passw0rdOK' } })
    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'ADMIN' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create user' }))

    await waitFor(() => expect(api.createUser).toHaveBeenCalledWith({
      name: 'New Person',
      email: 'new@example.com',
      password: 'Passw0rdOK',
      role: 'ADMIN',
    }))
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Created the account for New Person.',
    )
    expect(screen.getByLabelText('Name')).toHaveValue('')
    expect(screen.getByLabelText(/First password/)).toHaveValue('')
    await waitFor(() => expect(api.listUsers).toHaveBeenCalledTimes(2))
  })

  it('reports a duplicate email without clearing what was typed', async () => {
    const api = createApi({
      createUser: vi.fn().mockRejectedValue(
        new Error('An account with this email already exists'),
      ),
    })
    render(<AdminUsers api={api} currentUser={admin} />)
    await screen.findByText('Ben Member')

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Dup' } })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ben@example.com' } })
    fireEvent.change(screen.getByLabelText(/First password/), { target: { value: 'Passw0rdOK' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create user' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'An account with this email already exists',
    )
    expect(screen.getByLabelText('Email')).toHaveValue('ben@example.com')
  })

  it('pages through the user list', async () => {
    const api = createApi({
      listUsers: vi.fn()
        .mockResolvedValueOnce({ data: users, pagination: { page: 1, limit: 20, total: 45 } })
        .mockResolvedValueOnce({
          data: [{ id: '9', name: 'Zed Last', email: 'zed@example.com', role: 'MEMBER', active: true }],
          pagination: { page: 2, limit: 20, total: 45 },
        }),
    })
    render(<AdminUsers api={api} currentUser={admin} />)
    await screen.findByText('Ben Member')

    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Next' }))

    expect(await screen.findByText('Zed Last')).toBeInTheDocument()
    expect(api.listUsers).toHaveBeenLastCalledWith({ page: 2, limit: 20 })
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument()
  })

  it('shows an error when the list cannot be loaded', async () => {
    const api = createApi({
      listUsers: vi.fn().mockRejectedValue(new Error('Insufficient permissions')),
    })
    render(<AdminUsers api={api} currentUser={admin} />)

    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText('Insufficient permissions')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})
