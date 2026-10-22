import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ProjectWorkspace from './ProjectWorkspace'

const project = {
  id: '8',
  name: 'Release plan',
  description: 'Plan the launch',
  archived: false,
  permissions: { canManage: true, canArchive: true },
}
const dashboard = {
  countsByStatus: { TODO: 0, IN_PROGRESS: 0, DONE: 0 },
  percentComplete: 0,
  overdue: 0,
}

afterEach(() => vi.restoreAllMocks())

describe('ProjectWorkspace', () => {
  it('updates project settings and surfaces server errors', async () => {
    const api = {
      getProject: vi.fn().mockResolvedValue({ data: project }),
      getDashboard: vi.fn().mockResolvedValue({ data: dashboard }),
      updateProject: vi.fn().mockRejectedValue(new Error('Update was rejected')),
      archiveProject: vi.fn(),
    }

    render(<ProjectWorkspace api={api} projectId="8" onBack={vi.fn()} />)
    expect(await screen.findByRole('heading', { name: 'Release plan' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Edit project' }))
    fireEvent.change(screen.getByLabelText('Project name'), {
      target: { value: 'Launch plan' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(api.updateProject).toHaveBeenCalledWith('8', {
      name: 'Launch plan',
      description: 'Plan the launch',
    }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Update was rejected')
  })

  it('archives projects only after confirmation and then hides write controls', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const api = {
      getProject: vi.fn().mockResolvedValue({ data: project }),
      getDashboard: vi.fn().mockResolvedValue({ data: dashboard }),
      updateProject: vi.fn(),
      archiveProject: vi.fn().mockResolvedValue({
        data: {
          ...project,
          archived: true,
          permissions: { canManage: true, canArchive: true },
        },
      }),
    }

    render(<ProjectWorkspace api={api} projectId="8" onBack={vi.fn()} />)
    await screen.findByRole('heading', { name: 'Release plan' })
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }))

    expect(confirm).toHaveBeenCalledWith(
      'Archive "Release plan"? The project will become read-only.',
    )
    await waitFor(() => expect(api.archiveProject).toHaveBeenCalledWith('8'))
    expect(await screen.findByText('Archived · read only')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Archive' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit project' })).not.toBeInTheDocument()
  })
})
