
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { testConnection, pool } = require('./config/db');

const app = express();

app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
}));
app.use(express.json({ limit: '1mb' }));

app.use('/api/v1/tasks', (_req, res) => res.status(503).json({
  error: {
    code: 'API_NOT_CONFIGURED',
    message: 'Task routes require authentication and project authorization integration',
  },
}));

app.get('/api/v1/health', async (req, res) => {
  try {
    const db = await testConnection();

    res.status(200).json({
      status: 'ok',
      database: 'connected',
      timestamp: db.server_time,
    });
  } catch (error) {
    console.error('Health check failed:', error.message);

    res.status(503).json({
      status: 'error',
      database: 'disconnected',
      message: 'Service temporarily unavailable',
    });
  }
});

const port = Number(process.env.PORT || 5000);

if (require.main === module) {
  app.listen(port, () => {
    console.log(`Task Manager API listening on port ${port}`);
  });
}

module.exports = { app, pool };
