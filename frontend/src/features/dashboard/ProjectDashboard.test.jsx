import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ProjectDashboard from './ProjectDashboard'

describe('ProjectDashboard', () => {
  it('renders counts and completion from the project API', async () => {
    const api = {
      getDashboard: vi.fn().mockResolvedValue({
        data: {
          countsByStatus: { TODO: 3, IN_PROGRESS: 1, DONE: 4 },
          percentComplete: 50,
          overdue: 2,
        },
      }),
    }

    render(<ProjectDashboard api={api} projectId="9" />)

    expect(await screen.findByText('50%')).toBeInTheDocument()
    expect(screen.getByText('8')).toBeInTheDocument()
    expect(screen.getByText('2', { selector: 'strong' })).toBeInTheDocument()
    expect(api.getDashboard).toHaveBeenCalledWith('9')
  })

  it('shows zero completion for a zero-task project', async () => {
    const api = {
      getDashboard: vi.fn().mockResolvedValue({
        data: {
          countsByStatus: { TODO: 0, IN_PROGRESS: 0, DONE: 0 },
          percentComplete: 0,
          overdue: 0,
        },
      }),
    }

    render(<ProjectDashboard api={api} projectId="9" />)

    expect(await screen.findByText('0%')).toBeInTheDocument()
    expect(screen.getByText('0 of 0 tasks complete')).toBeInTheDocument()
  })

  it('renders a retryable error state', async () => {
    const api = {
      getDashboard: vi.fn().mockRejectedValue(new Error('Database unavailable')),
    }

    render(<ProjectDashboard api={api} projectId="9" />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Database unavailable')
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })
})
