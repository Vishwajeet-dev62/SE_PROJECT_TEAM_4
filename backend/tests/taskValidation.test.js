'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validateTaskBody,
  parsePagination,
  buildListFilters,
} = require('../src/controllers/taskController');

test('create validation rejects a missing title', () => {
  const { errors } = validateTaskBody({ project_id: 1, created_by: 1 });
  assert.ok(errors.some((error) => error.field === 'title'));
});

test('create validation rejects an invalid status', () => {
  const { errors } = validateTaskBody({
    project_id: 1, created_by: 1, title: 'Task', status: 'WAITING',
  });
  assert.ok(errors.some((error) => error.field === 'status'));
});

test('update validation rejects an invalid status', () => {
  const { errors } = validateTaskBody({ status: 'WAITING' }, { partial: true });
  assert.ok(errors.some((error) => error.field === 'status'));
});

test('update validation rejects an empty update', () => {
  const { errors } = validateTaskBody({}, { partial: true });
  assert.ok(errors.some((error) => error.field === 'body'));
});

test('status filter rejects an invalid value', () => {
  assert.equal(buildListFilters({ status: 'WAITING' }).error, 'Invalid task status filter');
});

test('priority filter rejects an invalid value', () => {
  assert.equal(buildListFilters({ priority: 'URGENT' }).error, 'Invalid task priority filter');
});

test('pagination defaults to page 1 and limit 20', () => {
  assert.deepEqual(parsePagination({}), { page: 1, limit: 20, offset: 0 });
});

test('pagination rejects zero, negative, non-numeric, and excessive limits', () => {
  for (const query of [{ page: '0' }, { page: '-1' }, { page: 'abc' }, { limit: '101' }]) {
    assert.equal(parsePagination(query), null);
  }
});

test('task validation rejects unknown fields', () => {
  const { errors } = validateTaskBody({
    project_id: 1, created_by: 1, title: 'Task', is_admin: true,
  });
  assert.ok(errors.some((error) => error.field === 'is_admin'));
});

test('task validation trims title and enforces the maximum length', () => {
  assert.equal(validateTaskBody({
    project_id: 1, created_by: 1, title: '  Valid title  ',
  }).errors.length, 0);
  assert.ok(validateTaskBody({
    project_id: 1, created_by: 1, title: 'x'.repeat(151),
  }).errors.some((error) => error.field === 'title'));
});

test('list filters use parameter placeholders rather than interpolating values', () => {
  const filters = buildListFilters({ projectId: '3', status: 'TODO', search: 'report' });
  assert.equal(filters.error, undefined);
  assert.match(filters.where, /t\.project_id = \?/);
  assert.match(filters.where, /t\.status = \?/);
  assert.deepEqual(filters.params.slice(0, 2), [3, 'TODO']);
});

test('list filters reject invalid project IDs', () => {
  assert.equal(buildListFilters({ projectId: '1 OR 1=1' }).error, 'projectId must be a positive integer');
});
