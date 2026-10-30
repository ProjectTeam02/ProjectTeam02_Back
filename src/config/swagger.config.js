/**
 * Swagger API 문서 설정
 * 백엔드 작업: 실제 구현된 엔드포인트와 인증 문서 유지
 * 주의: 문서 경로·Method·응답 구조를 라우터와 일치시킨다.
 */
module.exports = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'Leren Backend API',
      version: '1.0.0',
      description: 'Leren 백엔드 API 문서입니다. 현재 구현된 상태 확인 API를 기준으로 제공합니다.',
    },
    servers: [{ url: 'http://localhost:3000' }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
    },
    paths: {
      '/health': {
        get: {
          tags: ['Health'],
          summary: 'Node.js 프로세스 상태 확인',
          responses: { 200: { description: '서비스가 실행 중입니다.' } },
        },
      },
    },
  },
  apis: ['./src/**/*.routes.js'],
};
