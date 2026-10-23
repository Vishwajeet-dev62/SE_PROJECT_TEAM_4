'use strict';

const express = require('express');
const {
  listTasks,
  listDeletedTasks,
  createTask,
  getTaskById,
  updateTask,
  deleteTask,
  restoreTask,
  exportTasksCsv,
} = require('../controllers/taskController');

const router = express.Router();

// Register named routes before /:id to avoid treating them as task IDs.
router.get('/trash', listDeletedTasks);
router.get('/export.csv', exportTasksCsv);

router.route('/')
  .get(listTasks)
  .post(createTask);

router.route('/:id')
  .get(getTaskById)
  .patch(updateTask)
  .delete(deleteTask);

router.post('/:id/restore', restoreTask);

module.exports = router;
