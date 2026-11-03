const express = require('express');
const auth = require('../../common/middleware/auth.middleware');
const { AppDataSource } = require('../../config/database');
const conceptService = require('./concept.service');
const conceptController = require('./concept.controller');

const service = conceptService(AppDataSource);
const controller = conceptController(service);
const router = express.Router();

router.get('/:stepId', auth, controller.getConceptCard);

module.exports = router;
