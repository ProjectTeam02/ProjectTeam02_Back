/**
 * Express 애플리케이션 설정 파일
 * 백엔드 작업: 공통 미들웨어, 라우터, Swagger 연결
 * 주의: 비즈니스 로직은 기능별 Service에서 처리
 */
const express = require('express');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');

const swaggerConfig = require('./config/swagger.config');
const routes = require('./routes');
const AppError = require('./common/errors/AppError');
const errorMiddleware = require('./common/middleware/error.middleware');

const app = express();
const swaggerSpec = swaggerJsdoc(swaggerConfig);

app.use(express.json());

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get('/api-docs.json', (_req, res) => res.json(swaggerSpec));

app.get('/health', (_req, res) => {
  res.json({ success: true, message: 'Leren BackEnd is running.' });
});

// 기능별 API는 구현된 라우터만 이 통합 라우터를 통해 노출한다.
app.use('/api/v1', routes);

app.use((_req, _res, next) => {
  next(new AppError('요청한 API를 찾을 수 없습니다.', 404, 'NOT_FOUND'));
});
app.use(errorMiddleware);

module.exports = app;
