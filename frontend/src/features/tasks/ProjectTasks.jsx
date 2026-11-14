
import { useCallback, useEffect, useState } from 'react'
import './ProjectTasks.css'

const PAGE_SIZE = 10

const STATUSES = [
  { value: 'TODO', label: 'To Do' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'DONE', label: 'Done' },
]

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH']

const EMPTY_FORM = {
  title: '',
  description: '',
  status: 'TODO',
  priority: 'MEDIUM',
  category_id: '',
  tagIds: [],
  due_date: '',
}

function getErrorMessage(error) {
  return error?.message || 'Something went wrong. Please try again.'
}

function formatDate(value) {
  if (!value) return 'No due date'

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return value

  return date.toLocaleDateString()
}

function canAssignTask(task, project, user) {
  if (!user?.id || project.archived) return false

  const userId = String(user.id)

  return (
    user.role === 'ADMIN' ||
    (project.ownerId != null &&
      String(project.ownerId) === userId) ||
    (task.createdBy != null &&
      String(task.createdBy) === userId) ||
    (task.assignedTo != null &&
      String(task.assignedTo) === userId)
  )
}

function ProjectTasks({ api, project, user = null }) {
  const [tasks, setTasks] = useState([])
  const [categories, setCategories] = useState([])
  const [tags, setTags] = useState([])
  const [members, setMembers] = useState([])
  const [assigningTaskId, setAssigningTaskId] = useState(null)

  const [editingCategoryId, setEditingCategoryId] = useState(null)
  const [editingCategoryName, setEditingCategoryName] = useState('')
  const [categoryActionError, setCategoryActionError] = useState('')
  const [categoryActionLoading, setCategoryActionLoading] = useState(false)

  const [pagination, setPagination] = useState({
    page: 1,
    limit: PAGE_SIZE,
    total: 0,
    totalPages: 1,
  })

  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [tagFilter, setTagFilter] = useState('')
  const [assigneeFilter, setAssigneeFilter] = useState('')
  const [showTrash, setShowTrash] = useState(false)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const [showForm, setShowForm] = useState(false)
  const [editingTask, setEditingTask] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState('')

  const [categoryName, setCategoryName] = useState('')
  const [tagName, setTagName] = useState('')
  const [creatingCategory, setCreatingCategory] = useState(false)
  const [creatingTag, setCreatingTag] = useState(false)

  const projectId = project.id
  const archived = Boolean(project.archived)

  const loadMetadata = useCallback(async () => {
    try {
      const [categoryResponse, tagResponse] = await Promise.all([
        api.listCategories(projectId),
        api.listTags(projectId),
      ])

      setCategories(categoryResponse.data || [])
      setTags(tagResponse.data || [])
    } catch (loadError) {
      setError(getErrorMessage(loadError))
    }
  }, [api, projectId])

  const loadMembers = useCallback(async () => {
    try {
      const firstResponse = await api.listMembers(projectId, {
        page: 1,
        limit: 20,
      })

      const allMembers = [...(firstResponse.data || [])]
      const totalPages = firstResponse.pagination?.totalPages || 1

      for (let currentPage = 2; currentPage <= totalPages; currentPage += 1) {
        const response = await api.listMembers(projectId, {
          page: currentPage,
          limit: 20,
        })

        allMembers.push(...(response.data || []))
      }

      setMembers(allMembers)
    } catch (loadError) {
      setError(getErrorMessage(loadError))
    }
  }, [api, projectId])

  const loadTasks = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const query = {
        page,
        limit: PAGE_SIZE,
      }

      if (search.trim()) query.search = search.trim()
      if (statusFilter) query.status = statusFilter
      if (priorityFilter) query.priority = priorityFilter
      if (categoryFilter) query.categoryId = categoryFilter
      if (tagFilter) query.tagId = tagFilter
      if (assigneeFilter) query.assignedTo = assigneeFilter

      const response = showTrash
        ? await api.listDeletedTasks(projectId, {
            page,
            limit: PAGE_SIZE,
          })
        : await api.listTasks(projectId, query)

      setTasks(response.data || [])

      setPagination(
        response.pagination || {
          page: 1,
          limit: PAGE_SIZE,
          total: 0,
          totalPages: 1,
        },
      )
    } catch (loadError) {
      setError(getErrorMessage(loadError))
      setTasks([])
    } finally {
      setLoading(false)
    }
  }, [
    api,
    projectId,
    page,
    search,
    statusFilter,
    priorityFilter,
    categoryFilter,
    tagFilter,
    assigneeFilter,
    showTrash,
  ])

  // Export all matching project tasks as a CSV file.
  async function exportTasks() {
    setExporting(true)
    setError('')
    setNotice('')

    const query = {}

    if (search.trim()) query.search = search.trim()
    if (statusFilter) query.status = statusFilter
    if (priorityFilter) query.priority = priorityFilter
    if (categoryFilter) query.categoryId = categoryFilter
    if (tagFilter) query.tagId = tagFilter
    if (assigneeFilter) query.assignedTo = assigneeFilter

    try {
      const blob = await api.exportTasksCsv(projectId, query)
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')

      link.href = url
      link.download = 'tasks.csv'

      document.body.appendChild(link)
      link.click()
      link.remove()

      window.setTimeout(() => {
        window.URL.revokeObjectURL(url)
      }, 1000)

      setNotice('Tasks exported successfully.')
    } catch (exportError) {
      setError(getErrorMessage(exportError))
    } finally {
      setExporting(false)
    }
  }

  useEffect(() => {
    let cancelled = false

    async function run() {
      await Promise.resolve()

      if (!cancelled) {
        await loadMetadata()
      }
    }

    void run()

    return () => {
      cancelled = true
    }
  }, [loadMetadata])

  useEffect(() => {
    let cancelled = false

    async function run() {
      await Promise.resolve()

      if (!cancelled) {
        await loadMembers()
      }
    }

    void run()

    return () => {
      cancelled = true
    }
  }, [loadMembers])

  useEffect(() => {
    let cancelled = false

    async function run() {
      await Promise.resolve()

      if (!cancelled) {
        await loadTasks()
      }
    }

    void run()

    return () => {
      cancelled = true
    }
  }, [loadTasks])

  function updateField(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }))
  }

  function openCreateForm() {
    setEditingTask(null)
    setForm({ ...EMPTY_FORM })
    setCategoryName('')
    setTagName('')
    setFormError('')
    setShowForm(true)
  }

  function openEditForm(task) {
    if (task.permissions?.canEdit === false || archived) return

    setEditingTask(task)

    setForm({
      title: task.title || '',
      description: task.description || '',
      status: task.status || 'TODO',
      priority: task.priority || 'MEDIUM',
      category_id: task.categoryId || '',
      tagIds: (task.tags || []).map((tag) => tag.id),
      due_date: task.dueDate
        ? String(task.dueDate).slice(0, 10)
        : '',
    })

    setCategoryName('')
    setTagName('')
    setFormError('')
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditingTask(null)
    setForm({ ...EMPTY_FORM })
    setCategoryName('')
    setTagName('')
    setFormError('')
  }

  async function submitTask(event) {
    event.preventDefault()

    if (archived) return

    if (!form.title.trim()) {
      setFormError('Task title is required.')
      return
    }

    if (form.title.trim().length > 150) {
      setFormError('Task title cannot exceed 150 characters.')
      return
    }

    setSaving(true)
    setFormError('')
    setNotice('')

    const body = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      status: form.status,
      priority: form.priority,
      category_id: form.category_id || null,
      tagIds: form.tagIds,
      due_date: form.due_date || null,
    }

    try {
      if (editingTask) {
        await api.updateTask(editingTask.id, body)
        setNotice('Task updated successfully.')
      } else {
        await api.createTask(projectId, body)
        setNotice('Task created successfully.')
        setPage(1)
      }

      closeForm()
      await loadTasks()
    } catch (saveError) {
      setFormError(getErrorMessage(saveError))
    } finally {
      setSaving(false)
    }
  }

  async function deleteTask(task) {
    if (archived || task.permissions?.canDelete === false) return

    if (!window.confirm(`Move "${task.title}" to trash?`)) return

    setError('')
    setNotice('')

    try {
      await api.deleteTask(task.id)
      setNotice('Task moved to trash.')
      await loadTasks()
    } catch (deleteError) {
      setError(getErrorMessage(deleteError))
    }
  }

  async function restoreTask(task) {
    if (archived) return

    setError('')
    setNotice('')

    try {
      await api.restoreTask(task.id)
      setNotice('Task restored successfully.')
      await loadTasks()
    } catch (restoreError) {
      setError(getErrorMessage(restoreError))
    }
  }

  async function changeStatus(task, nextStatus) {
    if (
      archived ||
      task.permissions?.canEdit === false ||
      task.status === nextStatus
    ) {
      return
    }

    setError('')
    setNotice('')

    try {
      await api.updateTaskStatus(task.id, nextStatus)
      setNotice('Task status updated.')
      await loadTasks()
    } catch (updateError) {
      setError(getErrorMessage(updateError))
    }
  }

  async function changeAssignee(task, nextAssigneeId) {
    if (
      !canAssignTask(task, project, user) ||
      assigningTaskId === task.id
    ) {
      return
    }

    const currentAssigneeId =
      task.assignedTo == null ? '' : String(task.assignedTo)

    if (currentAssigneeId === nextAssigneeId) return

    setAssigningTaskId(task.id)
    setError('')
    setNotice('')

    try {
      await api.assignTask(
        task.id,
        nextAssigneeId === '' ? null : nextAssigneeId,
      )

      setNotice(
        nextAssigneeId === ''
          ? 'Task unassigned successfully.'
          : 'Task assigned successfully.',
      )

      await loadTasks()
    } catch (assignmentError) {
      setError(getErrorMessage(assignmentError))
    } finally {
      setAssigningTaskId(null)
    }
  }

  async function createCategory() {
    if (archived || !categoryName.trim()) return

    setCreatingCategory(true)
    setFormError('')

    try {
      const response = await api.createCategory(
        projectId,
        categoryName.trim(),
      )

      const category = response.data

      setCategories((current) =>
        [...current, category].sort((a, b) =>
          a.name.localeCompare(b.name),
        ),
      )

      updateField('category_id', category.id)
      setCategoryName('')
    } catch (createError) {
      setFormError(getErrorMessage(createError))
    } finally {
      setCreatingCategory(false)
    }
  }

  async function updateCategory() {
    if (
      editingCategoryId == null ||
      !editingCategoryName.trim()
    ) {
      return
    }

    setCategoryActionLoading(true)
    setCategoryActionError('')

    try {
      const response = await api.updateCategory(
        projectId,
        editingCategoryId,
        editingCategoryName.trim(),
      )

      const updatedCategory = response.data

      setCategories((current) =>
        current
          .map((category) =>
            String(category.id) === String(editingCategoryId)
              ? updatedCategory
              : category,
          )
          .sort((a, b) => a.name.localeCompare(b.name)),
      )

      setEditingCategoryId(null)
      setEditingCategoryName('')
      setNotice('Category updated successfully.')
    } catch (updateError) {
      setCategoryActionError(getErrorMessage(updateError))
    } finally {
      setCategoryActionLoading(false)
    }
  }

  async function deleteCategory(categoryId) {
    const confirmed = window.confirm(
      'Delete this category? Tasks using it will remain, but will no longer have a category.',
    )

    if (!confirmed) return

    setCategoryActionLoading(true)
    setCategoryActionError('')

    try {
      await api.deleteCategory(projectId, categoryId)

      setCategories((current) =>
        current.filter(
          (category) => String(category.id) !== String(categoryId),
        ),
      )

      if (String(categoryFilter) === String(categoryId)) {
        setCategoryFilter('')
        setPage(1)
      }

      if (String(form.category_id) === String(categoryId)) {
        updateField('category_id', '')
      }

      if (String(editingCategoryId) === String(categoryId)) {
        setEditingCategoryId(null)
        setEditingCategoryName('')
      }

      setNotice('Category deleted successfully.')
    } catch (deleteError) {
      setCategoryActionError(getErrorMessage(deleteError))
    } finally {
      setCategoryActionLoading(false)
    }
  }

  async function createTag() {
    if (archived || !tagName.trim()) return

    setCreatingTag(true)
    setFormError('')

    try {
      const response = await api.createTag(
        projectId,
        tagName.trim(),
      )

      const tag = response.data

      setTags((current) =>
        [...current, tag].sort((a, b) =>
          a.name.localeCompare(b.name),
        ),
      )

      setForm((current) => ({
        ...current,
        tagIds: [...current.tagIds, tag.id],
      }))

      setTagName('')
    } catch (createError) {
      setFormError(getErrorMessage(createError))
    } finally {
      setCreatingTag(false)
    }
  }

  function toggleTag(tagId) {
    setForm((current) => ({
      ...current,
      tagIds: current.tagIds.includes(tagId)
        ? current.tagIds.filter((id) => id !== tagId)
        : [...current.tagIds, tagId],
    }))
  }

  function changeFilter(setter, value) {
    setter(value)
    setPage(1)
  }

  const pageCount = Math.max(
    1,
    pagination.totalPages ||
      Math.ceil(pagination.total / PAGE_SIZE),
  )

  return (
    <section className="project-tasks" aria-label="Project tasks">
      <div className="tasks-heading">
        <div>
          <h2>{showTrash ? 'Task trash' : 'Tasks'}</h2>
          <p className="muted">
            {pagination.total} {showTrash ? 'deleted' : 'active'} tasks
          </p>
        </div>

        <div className="tasks-heading-actions">
          {!showTrash && (
            <button
              type="button"
              className="secondary-button"
              onClick={exportTasks}
              disabled={exporting}
            >
              {exporting ? 'Exporting...' : 'Export CSV'}
            </button>
          )}

          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              setShowTrash((current) => !current)
              setPage(1)
              setNotice('')
              setError('')
            }}
          >
            {showTrash ? 'Back to tasks' : 'View trash'}
          </button>

          {!showTrash && (
            <button
              type="button"
              className="primary-button"
              onClick={openCreateForm}
              disabled={archived}
            >
              + Create task
            </button>
          )}
        </div>
      </div>

      {archived && (
        <p className="muted" role="status">
          This project is archived. Tasks are read-only.
        </p>
      )}

      {notice && (
        <p className="success-message" role="status">
          {notice}
        </p>
      )}

      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}

      {!showTrash && (
        <section
          className="category-management"
          aria-label="Category management"
        >
          <div className="tasks-heading">
            <div>
              <h3>Manage categories</h3>
              <p className="muted">
                Rename or delete categories used to organize project tasks.
              </p>
            </div>
          </div>

          {categoryActionError && (
            <p className="error-message" role="alert">
              {categoryActionError}
            </p>
          )}

          {categories.length === 0 ? (
            <p className="muted">No categories created yet.</p>
          ) : (
            <div className="category-list">
              {categories.map((category) => (
                <div className="inline-create-form" key={category.id}>
                  {String(editingCategoryId) === String(category.id) ? (
                    <>
                      <label>
                        Category name
                        <input
                          type="text"
                          maxLength={80}
                          value={editingCategoryName}
                          onChange={(event) =>
                            setEditingCategoryName(event.target.value)
                          }
                          disabled={categoryActionLoading || archived}
                        />
                      </label>

                      <button
                        type="button"
                        className="primary-button"
                        onClick={updateCategory}
                        disabled={
                          archived ||
                          categoryActionLoading ||
                          !editingCategoryName.trim()
                        }
                      >
                        {categoryActionLoading ? 'Saving...' : 'Save'}
                      </button>

                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => {
                          setEditingCategoryId(null)
                          setEditingCategoryName('')
                          setCategoryActionError('')
                        }}
                        disabled={categoryActionLoading}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <span>{category.name}</span>

                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => {
                          setEditingCategoryId(category.id)
                          setEditingCategoryName(category.name)
                          setCategoryActionError('')
                        }}
                        disabled={archived || categoryActionLoading}
                      >
                        Rename
                      </button>

                      <button
                        type="button"
                        className="text-button danger-button"
                        onClick={() => deleteCategory(category.id)}
                        disabled={archived || categoryActionLoading}
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {!showTrash && (
        <div className="task-filters">
          <label>
            Search
            <input
              type="search"
              maxLength={100}
              placeholder="Search task titles..."
              value={search}
              onChange={(event) =>
                changeFilter(setSearch, event.target.value)
              }
            />
          </label>

          <label>
            Status
            <select
              value={statusFilter}
              onChange={(event) =>
                changeFilter(setStatusFilter, event.target.value)
              }
            >
              <option value="">All statuses</option>
              {STATUSES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            Priority
            <select
              value={priorityFilter}
              onChange={(event) =>
                changeFilter(setPriorityFilter, event.target.value)
              }
            >
              <option value="">All priorities</option>
              {PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {priority}
                </option>
              ))}
            </select>
          </label>

          <label>
            Category
            <select
              value={categoryFilter}
              onChange={(event) =>
                changeFilter(setCategoryFilter, event.target.value)
              }
            >
              <option value="">All categories</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Tag
            <select
              value={tagFilter}
              onChange={(event) =>
                changeFilter(setTagFilter, event.target.value)
              }
            >
              <option value="">All tags</option>
              {tags.map((tag) => (
                <option key={tag.id} value={tag.id}>
                  {tag.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Assignee
            <select
              value={assigneeFilter}
              onChange={(event) =>
                changeFilter(setAssigneeFilter, event.target.value)
              }
            >
              <option value="">All assignees</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {loading ? (
        <p className="state-message" role="status">
          Loading tasks...
        </p>
      ) : tasks.length === 0 ? (
        <div className="state-card empty-state">
          <h3>{showTrash ? 'Trash is empty' : 'No tasks found'}</h3>
          <p>
            {showTrash
              ? 'Deleted tasks that can still be restored will appear here.'
              : 'Create a task or adjust your filters.'}
          </p>
        </div>
      ) : (
        <div className="task-list">
          {tasks.map((task) => (
            <article className="managed-task-card" key={task.id}>
              <div className="managed-task-main">
                <div className="managed-task-title">
                  <h3>{task.title}</h3>

                  <span
                    className={`priority priority-${(
                      task.priority || 'medium'
                    ).toLowerCase()}`}
                  >
                    {task.priority}
                  </span>
                </div>

                {task.description && <p>{task.description}</p>}

                <div className="managed-task-meta">
                  <span>
                    {STATUSES.find(
                      (item) => item.value === task.status,
                    )?.label || task.status}
                  </span>

                  <span>{formatDate(task.dueDate)}</span>

                  <span>
                    Assigned to:{' '}
                    {members.find(
                      (member) =>
                        String(member.id) === String(task.assignedTo),
                    )?.name ||
                      (task.assignedTo
                        ? 'Project member'
                        : 'Unassigned')}
                  </span>

                  {task.categoryId && (
                    <span>
                      {categories.find(
                        (item) => item.id === task.categoryId,
                      )?.name || 'Category'}
                    </span>
                  )}
                </div>

                {task.tags?.length > 0 && (
                  <div className="task-tags">
                    {task.tags.map((tag) => (
                      <span className="task-tag" key={tag.id}>
                        {tag.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="managed-task-actions">
                {showTrash ? (
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => restoreTask(task)}
                    disabled={archived}
                  >
                    Restore
                  </button>
                ) : (
                  <>
                    <label>
                      <span className="visually-hidden">
                        Assign {task.title} to a project member
                      </span>

                      <select
                        aria-label={`Assign ${task.title}`}
                        value={
                          task.assignedTo == null
                            ? ''
                            : String(task.assignedTo)
                        }
                        disabled={
                          !canAssignTask(task, project, user) ||
                          assigningTaskId === task.id
                        }
                        onChange={(event) =>
                          changeAssignee(task, event.target.value)
                        }
                      >
                        <option value="">Unassigned</option>
                        {members.map((member) => (
                          <option key={member.id} value={member.id}>
                            {member.name}
                            {member.role === 'OWNER' ? ' (Owner)' : ''}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label>
                      <span className="visually-hidden">
                        Change status for {task.title}
                      </span>

                      <select
                        value={task.status}
                        disabled={
                          archived ||
                          task.permissions?.canEdit === false
                        }
                        onChange={(event) =>
                          changeStatus(task, event.target.value)
                        }
                      >
                        {STATUSES.map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => openEditForm(task)}
                      disabled={
                        archived ||
                        task.permissions?.canEdit === false
                      }
                    >
                      Edit
                    </button>

                    <button
                      type="button"
                      className="text-button danger-button"
                      onClick={() => deleteTask(task)}
                      disabled={
                        archived ||
                        task.permissions?.canDelete === false
                      }
                    >
                      Delete
                    </button>
                  </>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {!loading && pagination.total > 0 && (
        <div className="pagination" aria-label="Task pages">
          <button
            type="button"
            className="secondary-button"
            disabled={page <= 1}
            onClick={() => setPage((current) => current - 1)}
          >
            Previous
          </button>

          <span>
            Page {page} of {pageCount}
          </span>

          <button
            type="button"
            className="secondary-button"
            disabled={page >= pageCount}
            onClick={() => setPage((current) => current + 1)}
          >
            Next
          </button>
        </div>
      )}

      {showForm && (
        <div className="task-modal-backdrop">
          <section
            className="task-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="task-form-title"
          >
            <div className="task-modal-heading">
              <h2 id="task-form-title">
                {editingTask ? 'Edit task' : 'Create task'}
              </h2>

              <button
                type="button"
                className="text-button"
                onClick={closeForm}
                aria-label="Close task form"
              >
                ×
              </button>
            </div>

            {formError && (
              <p className="error-message" role="alert">
                {formError}
              </p>
            )}

            <form onSubmit={submitTask} className="task-form">
              <label>
                Task title
                <input
                  type="text"
                  required
                  maxLength={150}
                  value={form.title}
                  onChange={(event) =>
                    updateField('title', event.target.value)
                  }
                  placeholder="Enter task title"
                />
              </label>

              <label>
                Description
                <textarea
                  rows={3}
                  value={form.description}
                  onChange={(event) =>
                    updateField('description', event.target.value)
                  }
                  placeholder="Describe the task"
                />
              </label>

              <div className="task-form-grid">
                <label>
                  Status
                  <select
                    value={form.status}
                    onChange={(event) =>
                      updateField('status', event.target.value)
                    }
                  >
                    {STATUSES.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Priority
                  <select
                    value={form.priority}
                    onChange={(event) =>
                      updateField('priority', event.target.value)
                    }
                  >
                    {PRIORITIES.map((priority) => (
                      <option key={priority} value={priority}>
                        {priority}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label>
                Due date
                <input
                  type="date"
                  value={form.due_date}
                  onChange={(event) =>
                    updateField('due_date', event.target.value)
                  }
                />
              </label>

              <label>
                Category
                <select
                  value={form.category_id}
                  onChange={(event) =>
                    updateField('category_id', event.target.value)
                  }
                >
                  <option value="">No category</option>

                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="inline-create-form">
                <label>
                  New category
                  <input
                    value={categoryName}
                    maxLength={80}
                    onChange={(event) =>
                      setCategoryName(event.target.value)
                    }
                    placeholder="Category name"
                  />
                </label>

                <button
                  type="button"
                  className="secondary-button"
                  onClick={createCategory}
                  disabled={
                    creatingCategory || !categoryName.trim()
                  }
                >
                  {creatingCategory ? 'Adding...' : 'Add category'}
                </button>
              </div>

              <fieldset className="tag-picker">
                <legend>Tags</legend>

                {tags.length === 0 ? (
                  <p className="muted">No tags created yet.</p>
                ) : (
                  <div className="tag-options">
                    {tags.map((tag) => (
                      <label key={tag.id}>
                        <input
                          type="checkbox"
                          checked={form.tagIds.includes(tag.id)}
                          onChange={() => toggleTag(tag.id)}
                        />
                        {tag.name}
                      </label>
                    ))}
                  </div>
                )}
              </fieldset>

              <div className="inline-create-form">
                <label>
                  New tag
                  <input
                    value={tagName}
                    maxLength={80}
                    onChange={(event) =>
                      setTagName(event.target.value)
                    }
                    placeholder="Tag name"
                  />
                </label>

                <button
                  type="button"
                  className="secondary-button"
                  onClick={createTag}
                  disabled={creatingTag || !tagName.trim()}
                >
                  {creatingTag ? 'Adding...' : 'Add tag'}
                </button>
              </div>

              <div className="task-form-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={closeForm}
                  disabled={saving}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="primary-button"
                  disabled={saving}
                >
                  {saving
                    ? 'Saving...'
                    : editingTask
                      ? 'Save changes'
                      : 'Create task'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </section>
  )
}

export default ProjectTasks
