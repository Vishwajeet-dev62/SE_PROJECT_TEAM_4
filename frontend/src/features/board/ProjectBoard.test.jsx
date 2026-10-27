import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ProjectBoard from './ProjectBoard'

const project = { id: '8', name: 'Website', archived: false }
const task = {
  id: '52',
  title: 'Write launch notes',
  description: 'Prepare the release summary',
  status: 'TODO',
  priority: 'HIGH',
  dueDate: '2026-11-02',
  permissions: { canEdit: true },
}

describe('ProjectBoard', () => {
  it('groups real project tasks and persists status changes through Member 1 API', async () => {
    const updatedTask = { ...task, status: 'DONE' }
    const api = {
      getBoard: vi.fn()
        .mockResolvedValueOnce({
          data: { TODO: [task], IN_PROGRESS: [], DONE: [] },
          pagination: { page: 1, limit: 50, total: 1 },
        })
        .mockResolvedValueOnce({
          data: { TODO: [], IN_PROGRESS: [], DONE: [updatedTask] },
          pagination: { page: 1, limit: 50, total: 1 },
        }),
      updateTaskStatus: vi.fn().mockResolvedValue({ data: updatedTask }),
    }

    render(<ProjectBoard api={api} project={project} />)

    expect(await screen.findByRole('heading', { name: task.title })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'To Do' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(`Change status for ${task.title}`), {
      target: { value: 'DONE' },
    })

    await waitFor(() => expect(api.updateTaskStatus).toHaveBeenCalledWith('52', 'DONE'))
    await waitFor(() => expect(api.getBoard).toHaveBeenCalledTimes(2))
    expect(api.getBoard).toHaveBeenCalledWith('8', { page: 1, limit: 50 })
  })

  it('disables task writes for archived projects', async () => {
    const api = {
      getBoard: vi.fn().mockResolvedValue({
        data: { TODO: [task], IN_PROGRESS: [], DONE: [] },
        pagination: { page: 1, limit: 50, total: 1 },
      }),
      updateTaskStatus: vi.fn(),
    }

    render(<ProjectBoard api={api} project={{ ...project, archived: true }} />)

    expect(await screen.findByLabelText(`Change status for ${task.title}`)).toBeDisabled()
    expect(api.updateTaskStatus).not.toHaveBeenCalled()
  })

  it('disables task writes when the backend denies creator/assignee permission', async () => {
    const restrictedTask = {
      ...task,
      permissions: { canEdit: false },
    }
    const api = {
      getBoard: vi.fn().mockResolvedValue({
        data: { TODO: [restrictedTask], IN_PROGRESS: [], DONE: [] },
        pagination: { page: 1, limit: 50, total: 1 },
      }),
      updateTaskStatus: vi.fn(),
    }

    render(<ProjectBoard api={api} project={project} />)

    expect(await screen.findByLabelText(`Change status for ${task.title}`)).toBeDisabled()
    fireEvent.change(screen.getByLabelText(`Change status for ${task.title}`), {
      target: { value: 'DONE' },
    })
    expect(api.updateTaskStatus).not.toHaveBeenCalled()
  })
})
