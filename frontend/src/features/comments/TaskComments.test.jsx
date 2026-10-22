import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import TaskComments from './TaskComments'

const task = { id: '52', title: 'Write launch notes' }
const project = { id: '8', archived: false }
const comment = {
  id: '90',
  authorId: '7',
  authorName: 'Pratik',
  body: 'Review the release notes',
  createdAt: '2026-10-22T12:00:00.000Z',
  permissions: { canEdit: true, canDelete: true },
}

afterEach(() => vi.restoreAllMocks())

describe('TaskComments', () => {
  it('loads, creates, and edits comments through the API', async () => {
    const api = {
      listComments: vi.fn()
        .mockResolvedValueOnce({
          data: [comment],
          pagination: { page: 1, limit: 20, total: 1 },
        })
        .mockResolvedValueOnce({
          data: [{ ...comment, body: 'Updated release notes' }],
          pagination: { page: 1, limit: 20, total: 1 },
        })
        .mockResolvedValue({
          data: [{ ...comment, body: 'Updated release notes' }],
          pagination: { page: 1, limit: 20, total: 1 },
        }),
      createComment: vi.fn().mockResolvedValue({ data: comment }),
      updateComment: vi.fn().mockResolvedValue({
        data: { ...comment, body: 'Updated release notes' },
      }),
      deleteComment: vi.fn().mockResolvedValue(null),
    }

    render(<TaskComments api={api} task={task} project={project} onClose={vi.fn()} />)

    expect(await screen.findByText('Review the release notes')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Add a comment'), {
      target: { value: 'Include the support link' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Post comment' }))
    await waitFor(() => expect(api.createComment).toHaveBeenCalledWith(
      '52',
      'Include the support link',
    ))

    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }))
    fireEvent.change(screen.getByLabelText('Edit comment'), {
      target: { value: 'Updated release notes' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.updateComment).toHaveBeenCalledWith(
      '90',
      'Updated release notes',
    ))
  })

  it('confirms deletion and hides writes for archived projects', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const api = {
      listComments: vi.fn().mockResolvedValue({
        data: [comment],
        pagination: { page: 1, limit: 20, total: 1 },
      }),
      createComment: vi.fn(),
      updateComment: vi.fn(),
      deleteComment: vi.fn().mockResolvedValue(null),
    }

    const { rerender } = render(
      <TaskComments api={api} task={task} project={project} onClose={vi.fn()} />,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))
    expect(confirm).toHaveBeenCalled()
    await waitFor(() => expect(api.deleteComment).toHaveBeenCalledWith('90'))

    rerender(
      <TaskComments
        api={api}
        task={task}
        project={{ ...project, archived: true }}
        onClose={vi.fn()}
      />,
    )
    expect(await screen.findByText('Archived projects are read-only.')).toBeInTheDocument()
    expect(screen.queryByLabelText('Add a comment')).not.toBeInTheDocument()
  })
})
