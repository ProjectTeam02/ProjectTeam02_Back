const express = require('express');
const authRoutes = require('../modules/auth/auth.routes');
const userRoutes = require('../modules/users/user.routes');
const tutorRoutes = require('../modules/tutor/tutor.routes');
const quizRoutes = require('../modules/quizzes/quiz.routes');
const healthRoutes = require('../health/health.routes');

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/tutor', tutorRoutes);
router.use('/quizzes', quizRoutes);
router.use('/health', healthRoutes);

module.exports = router;
