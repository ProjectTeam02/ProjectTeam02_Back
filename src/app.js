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
