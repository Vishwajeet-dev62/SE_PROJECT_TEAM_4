
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { app } = require('../src/server');

test('POST /api/v1/tasks rejects a missing title', async () => {
  const response = await request(app)
    .post('/api/v1/tasks')
    .send({
      project_id: 1,
      created_by: 1,
    });

  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, 'VALIDATION_ERROR');
});

test('POST /api/v1/tasks rejects an invalid status', async () => {
  const response = await request(app)
    .post('/api/v1/tasks')
    .send({
      project_id: 1,
      created_by: 1,
      title: 'Test task',
      status: 'INVALID_STATUS',
    });

  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, 'VALIDATION_ERROR');
});

test('PATCH /api/v1/tasks/1 rejects an invalid status', async () => {
  const response = await request(app)
    .patch('/api/v1/tasks/1')
    .send({
      status: 'INVALID_STATUS',
    });

  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, 'VALIDATION_ERROR');
});

test('PATCH /api/v1/tasks/1 rejects an empty update', async () => {
  const response = await request(app)
    .patch('/api/v1/tasks/1')
    .send({});

  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, 'VALIDATION_ERROR');
});

test('GET /api/v1/tasks rejects an invalid status filter', async () => {
  const response = await request(app)
    .get('/api/v1/tasks')
    .query({ status: 'INVALID_STATUS' });

  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, 'VALIDATION_ERROR');
});

test('GET /api/v1/tasks rejects an invalid priority filter', async () => {
  const response = await request(app)
    .get('/api/v1/tasks')
    .query({ priority: 'URGENT' });

  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, 'VALIDATION_ERROR');
});
