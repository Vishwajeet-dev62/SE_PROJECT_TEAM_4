'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../src/server');

test('standalone task server fails closed until authentication and project access are integrated', async () => {
  const response = await request(app)
    .patch('/api/v1/tasks/1')
    .send({ status: 'DONE' });

  assert.equal(response.status, 503);
  assert.equal(response.body.error.code, 'API_NOT_CONFIGURED');
});
