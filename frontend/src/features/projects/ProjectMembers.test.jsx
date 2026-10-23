import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ProjectMembers from './ProjectMembers'

const project = {
  id: '8',
  archived: false,
  permissions: { canManage: true },
}
const members = [
  { id: '7', name: 'Owner', role: 'OWNER' },
  { id: '12', name: 'Member', role: 'MEMBER' },
]
const page = {
  data: members,
  pagination: { page: 1, limit: 20, total: 2 },
}

afterEach(() => vi.restoreAllMocks())

describe('ProjectMembers', () => {
  it('adds and removes members while keeping the owner membership protected', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const api = {
      listMembers: vi.fn().mockResolvedValue(page),
      addMember: vi.fn().mockResolvedValue({ data: { userId: '14' } }),
      removeMember: vi.fn().mockResolvedValue(null),
    }

    render(<ProjectMembers api={api} project={project} />)

    expect(await screen.findByText('Owner')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove Member' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove Owner' })).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Add member by user ID'), {
      target: { value: '14' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add member' }))
    await waitFor(() => expect(api.addMember).toHaveBeenCalledWith('8', '14'))

    fireEvent.click(await screen.findByRole('button', { name: 'Remove Member' }))
    await waitFor(() => expect(api.removeMember).toHaveBeenCalledWith('8', '12'))
  })

  it('does not expose membership writes to non-owners or on archived projects', async () => {
    const api = {
      listMembers: vi.fn().mockResolvedValue(page),
      addMember: vi.fn(),
      removeMember: vi.fn(),
    }
    const { rerender } = render(
      <ProjectMembers
        api={api}
        project={{ ...project, permissions: { canManage: false } }}
      />,
    )

    expect(await screen.findByText('Owner')).toBeInTheDocument()
    expect(screen.queryByLabelText('Add member by user ID')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove Member' })).not.toBeInTheDocument()

    rerender(
      <ProjectMembers
        api={api}
        project={{ ...project, archived: true }}
      />,
    )
    expect(screen.queryByLabelText('Add member by user ID')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove Member' })).not.toBeInTheDocument()
  })
})
