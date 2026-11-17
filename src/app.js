/**
 * Express 애플리케이션 설정
 * 백엔드 작업: 공통 미들웨어·라우터·Swagger 연결을 관리
 * 주의: 비즈니스 로직은 기능별 Service에서 처리한다.
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

// ALB 한 단계 뒤에서 실행되므로 X-Forwarded-For의 첫 번째 프록시만 신뢰합니다.
app.set('trust proxy', 1);

// 허용된 웹 출처에만 응답을 공개하며 기존 인증 검사는 유지합니다.
app.use((req, res, next) => {
  const origin = req.get('Origin');
  const allowed = (process.env.CORS_ORIGIN || '').split(',').map(v => v.trim()).filter(v => v && v !== '*');
  res.vary('Origin');
  if (!origin || !allowed.includes(origin)) return next();
  res.set('Access-Control-Allow-Origin', origin);
  if (req.method !== 'OPTIONS') return next();
  const method = req.get('Access-Control-Request-Method');
  const headers = (req.get('Access-Control-Request-Headers') || '').split(',').map(v => v.trim().toLowerCase()).filter(Boolean);
  if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method) || headers.some(v => !['content-type', 'authorization', 'idempotency-key'].includes(v))) return res.status(403).end();
  res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, Idempotency-Key');
  res.set('Access-Control-Max-Age', '300');
  return res.status(204).end();
});

app.use(express.json());

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
// Keep the earlier development URL working while exposing the agreed URL.
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get('/api-docs.json', (_req, res) => res.json(swaggerSpec));

app.get('/health', (_req, res) => {
  res.json({ service: 'leren-backend', status: 'UP', timestamp: new Date().toISOString() });
});

app.use('/api/v1', routes);
app.use((_req, _res, next) => next(AppError.notFound('요청한 API를 찾을 수 없습니다.')));
app.use(errorMiddleware);

module.exports = app;
