const express = require('express');
const auth = require('../../common/middleware/auth.middleware');
const { AppDataSource } = require('../../config/database');
const stageService = require('./stage.service');
const stageController = require('./stage.controller');

const service = stageService(AppDataSource);
const controller = stageController(service);
const router = express.Router();

router.get('/', auth, controller.getStages);
router.get('/:stageId/steps', auth, controller.getStageSteps);

module.exports = router;
