
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import App from './App'

describe('Task Manager dashboard', () => {
  it('renders the TaskFlow heading and task list', () => {
    render(<App />)

    expect(
      screen.getByRole('heading', {
        name: /stay organized\. get things done\./i,
      }),
    ).toBeInTheDocument()

    expect(
      screen.getByRole('heading', { name: /my tasks/i }),
    ).toBeInTheDocument()
  })

  it('shows the initial tasks', () => {
    render(<App />)

    expect(screen.getByText('Build the dashboard')).toBeInTheDocument()
    expect(screen.getByText('Create task form')).toBeInTheDocument()
  })
})
