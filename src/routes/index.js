/**
 * API 통합 라우터
 * 백엔드 작업: 실제 구현된 기능별 라우터를 `/api/v1` 아래에 연결
 * 주의: 중복 등록과 기존 API 경로 변경을 방지한다.
 */
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
