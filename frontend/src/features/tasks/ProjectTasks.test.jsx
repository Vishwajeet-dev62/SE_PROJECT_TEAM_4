
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ProjectTasks from './ProjectTasks'

const project = {
  id: '8',
  ownerId: '7',
  archived: false,
}

const task = {
  id: '21',
  projectId: '8',
  createdBy: '10',
  assignedTo: null,
  title: 'Launch task',
  description: 'Prepare the release',
  status: 'TODO',
  priority: 'HIGH',
  dueDate: null,
  tags: [],
  permissions: { canEdit: false },
}

const members = [
  { id: '7', name: 'Owner', role: 'OWNER' },
  { id: '10', name: 'Creator', role: 'MEMBER' },
  { id: '12', name: 'Another member', role: 'MEMBER' },
]

function createApi() {
  return {
    listTasks: vi.fn().mockResolvedValue({
      data: [task],
      pagination: {
        page: 1,
        limit: 10,
        total: 1,
        totalPages: 1,
      },
    }),
    listMembers: vi.fn().mockResolvedValue({
      data: members,
      pagination: { page: 1, limit: 20, total: 3 },
    }),
    listCategories: vi.fn().mockResolvedValue({ data: [] }),
    listTags: vi.fn().mockResolvedValue({ data: [] }),
    assignTask: vi.fn().mockResolvedValue({ data: task }),
  }
}


async function renderTasks({ user, projectOverride = {}, taskOverride = {} }) {
  const api = createApi()
  api.listTasks.mockResolvedValue({
    data: [{ ...task, ...taskOverride }],
    pagination: {
      page: 1,
      limit: 10,
      total: 1,
      totalPages: 1,
    },
  })

  render(
    <ProjectTasks
      api={api}
      project={{ ...project, ...projectOverride }}
      user={user}
    />,
  )

  const dropdown = await screen.findByRole('combobox', {
    name: 'Assign Launch task',
  })

  return { api, dropdown }
}


afterEach(() => {
  vi.restoreAllMocks()
})

describe('ProjectTasks assignment permissions', () => {
  it('allows an admin to assign a task', async () => {
    const { api, dropdown } = await renderTasks({
      user: { id: '99', role: 'ADMIN' },
    })

    expect(dropdown).toBeEnabled()

    fireEvent.change(dropdown, { target: { value: '12' } })

    await waitFor(() => {
      expect(api.assignTask).toHaveBeenCalledWith('21', '12')
    })
  })

  it('allows the project owner to assign a task', async () => {
    const { dropdown } = await renderTasks({
      user: { id: '7', role: 'MEMBER' },
    })

    expect(dropdown).toBeEnabled()
  })

  it('allows the task creator to assign a task', async () => {
    const { dropdown } = await renderTasks({
      user: { id: '10', role: 'MEMBER' },
    })

    expect(dropdown).toBeEnabled()
  })

  it('allows the current assignee to reassign a task', async () => {
    const { dropdown } = await renderTasks({
      user: { id: '12', role: 'MEMBER' },
      taskOverride: { assignedTo: '12' },
    })

    expect(dropdown).toBeEnabled()
  })

  it('allows the current assignee to unassign their task', async () => {
    const { api, dropdown } = await renderTasks({
      user: { id: '12', role: 'MEMBER' },
      taskOverride: { assignedTo: '12' },
    })

    fireEvent.change(dropdown, { target: { value: '' } })

    await waitFor(() => {
      expect(api.assignTask).toHaveBeenCalledWith('21', null)
    })
  })

  it('disables assignment for an unrelated project member', async () => {
    const { api, dropdown } = await renderTasks({
      user: { id: '14', role: 'MEMBER' },
    })

    expect(dropdown).toBeDisabled()

    fireEvent.change(dropdown, { target: { value: '12' } })

    expect(api.assignTask).not.toHaveBeenCalled()
  })

  it('disables assignment on an archived project', async () => {
    const { dropdown } = await renderTasks({
      user: { id: '7', role: 'MEMBER' },
      projectOverride: { archived: true },
    })

    expect(dropdown).toBeDisabled()
  })

  it('disables assignment when no authenticated user is provided', async () => {
    const { dropdown } = await renderTasks({
      user: null,
    })

    expect(dropdown).toBeDisabled()
  })
})
