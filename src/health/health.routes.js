const express = require('express');
const { AppDataSource } = require('../config/database');
const FastApiClient = require('../clients/fastapi.client');
const asyncHandler = require('../common/utils/asyncHandler');

const router = express.Router();
const fastapi = new FastApiClient();

async function databaseStatus() {
  try {
    await AppDataSource.query('SELECT 1');
    return 'CONNECTED';
  } catch (_error) {
    return 'DISCONNECTED';
  }
}

async function dependencyStatus() {
  const [database, fastapiStatus] = await Promise.all([
    databaseStatus(),
    fastapi.health(),
  ]);
  return {
    service: 'leren-backend',
    status: database === 'CONNECTED' && fastapiStatus.status === 'CONNECTED'
      ? 'READY' : 'DEGRADED',
    database,
    fastapi: fastapiStatus.status,
    timestamp: new Date().toISOString(),
  };
}

router.get('/ready', asyncHandler(async (_req, res) => {
  const result = await dependencyStatus();
  res.status(result.status === 'READY' ? 200 : 503).json(result);
}));

router.get('/dependencies', asyncHandler(async (_req, res) => {
  res.json(await dependencyStatus());
}));

module.exports = router;
