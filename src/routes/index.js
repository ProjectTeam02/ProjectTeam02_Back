/**
 * API 통합 라우터
 * 백엔드 작업: 기능별 라우터 등록 및 연결
 * 주의: 중복 등록과 기존 API 경로 변경을 방지
 */
const express = require('express');

const router = express.Router();

// 현재 모듈은 라우터 스캐폴드만 존재하므로 실제 엔드포인트가 생길 때 등록한다.
const moduleRoutes = [
  ['auth', require('../modules/auth/auth.routes')],
  ['users', require('../modules/users/user.routes')],
  ['tutor', require('../modules/tutor/tutor.routes')],
  ['quizzes', require('../modules/quizzes/quiz.routes')],
  ['questions', require('../modules/questions/question.routes')],
  ['learning', require('../modules/learning/learning.routes')],
  ['stages', require('../modules/stages/stage.routes')],
  ['concepts', require('../modules/concepts/concept.routes')],
  ['reviews', require('../modules/reviews/review.routes')],
  ['calendar', require('../modules/calendar/calendar.routes')],
  ['characters', require('../modules/characters/character.routes')],
  ['costumes', require('../modules/costumes/costume.routes')],
  ['notifications', require('../modules/notifications/notification.routes')],
  ['recommendations', require('../modules/recommendations/recommendation.routes')],
  ['topics', require('../modules/topics/topic.routes')],
];

moduleRoutes.forEach(([path, moduleRouter]) => router.use(`/${path}`, moduleRouter));

module.exports = router;
