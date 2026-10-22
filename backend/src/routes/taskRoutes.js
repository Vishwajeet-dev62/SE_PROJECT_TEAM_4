
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

// Specific paths must be registered before /:id.
router.get('/trash', listDeletedTasks);
router.get('/export.csv', exportTasksCsv);

router.get('/', listTasks);
router.post('/', createTask);
router.get('/:id', getTaskById);
router.patch('/:id', updateTask);
router.delete('/:id', deleteTask);
router.post('/:id/restore', restoreTask);

module.exports = router;
