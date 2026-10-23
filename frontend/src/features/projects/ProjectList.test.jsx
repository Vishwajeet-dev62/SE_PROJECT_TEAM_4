import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ProjectList from './ProjectList'

const emptyPage = {
  data: [],
  pagination: { page: 1, limit: 20, total: 0 },
}

describe('ProjectList', () => {
  it('loads actual project data and opens the selected project', async () => {
    const onOpenProject = vi.fn()
    const api = {
      listProjects: vi.fn().mockResolvedValue({
        data: [{ id: '12', name: 'Roadmap', description: 'Plan releases', archived: false }],
        pagination: { page: 1, limit: 20, total: 1 },
      }),
    }

    render(<ProjectList api={api} onOpenProject={onOpenProject} />)

    expect(await screen.findByRole('button', { name: /Roadmap/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Roadmap/ }))
    expect(onOpenProject).toHaveBeenCalledWith('12')
    expect(api.listProjects).toHaveBeenCalledWith({ page: 1, limit: 20 })
  })

  it('creates a project through the API and shows an empty state', async () => {
    const onOpenProject = vi.fn()
    const api = {
      listProjects: vi.fn().mockResolvedValue(emptyPage),
      createProject: vi.fn().mockResolvedValue({ data: { id: '14' } }),
    }

    render(<ProjectList api={api} onOpenProject={onOpenProject} />)
    expect(await screen.findByRole('heading', { name: 'No projects yet' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Create project' }))
    fireEvent.change(screen.getByLabelText('Project name'), {
      target: { value: 'Release plan' },
    })
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'Track the upcoming release' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create project', exact: true }))

    await waitFor(() => expect(api.createProject).toHaveBeenCalledWith({
      name: 'Release plan',
      description: 'Track the upcoming release',
    }))
    expect(onOpenProject).toHaveBeenCalledWith('14')
  })

  it('surfaces authentication and server errors instead of showing mock projects', async () => {
    const api = {
      listProjects: vi.fn().mockRejectedValue(new Error('Authentication integration is not configured')),
    }

    render(<ProjectList api={api} onOpenProject={vi.fn()} />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Authentication integration is not configured',
    )
    expect(screen.queryByText('Build the dashboard')).not.toBeInTheDocument()
  })
})
