// 기기(푸시 토큰) 등록·해제 API Swagger (E-1)
const auth = [{ bearerAuth: [] }];
const error = description => ({ description, content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } });
const success = (description, name) => ({ description, content: { 'application/json': { schema: {
  type: 'object', required: ['success', 'data'], properties: { success: { type: 'boolean', example: true }, data: { $ref: `#/components/schemas/${name}` } },
} } } });
const deviceUuid = { type: 'string', minLength: 1, maxLength: 100, pattern: '^[A-Za-z0-9._:-]{1,100}$', description: '앱 설치마다 한 번 만들어 저장하는 식별자 (UUID 권장)' };

module.exports = {
  schemas: {
    DeviceRegisterRequest: {
      type: 'object', additionalProperties: false, required: ['deviceUuid', 'platform', 'notificationPermission'],
      properties: {
        deviceUuid,
        platform: { type: 'string', enum: ['IOS', 'ANDROID'] },
        notificationPermission: { type: 'boolean', description: 'OS 알림 권한 허용 여부' },
        pushToken: { type: 'string', nullable: true, maxLength: 512, example: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]', description: 'Expo 푸시 토큰. null이면 토큰 해제, 생략하면 기존 값 유지' },
        osVersion: { type: 'string', nullable: true, maxLength: 30 },
        appVersion: { type: 'string', nullable: true, maxLength: 30 },
        deviceModel: { type: 'string', nullable: true, maxLength: 100 },
      },
    },
    Device: {
      type: 'object', required: ['deviceId', 'deviceUuid', 'platform', 'notificationPermission', 'isActive', 'pushTokenRegistered', 'updatedAt'],
      properties: {
        deviceId: { type: 'string', format: 'uuid' }, deviceUuid: { type: 'string' },
        platform: { type: 'string', enum: ['IOS', 'ANDROID'] },
        notificationPermission: { type: 'boolean' }, isActive: { type: 'boolean' },
        pushTokenRegistered: { type: 'boolean', description: '푸시 토큰 등록 여부 (토큰 원문은 응답하지 않음)' },
        updatedAt: { type: 'string', format: 'date-time', nullable: true },
      },
    },
    DeviceRemoved: { type: 'object', required: ['deviceUuid', 'isActive'], properties: { deviceUuid: { type: 'string' }, isActive: { type: 'boolean', example: false } } },
  },
  paths: {
    '/api/v1/users/me/devices': { put: {
      tags: ['Notifications'], security: auth, summary: '기기·푸시 토큰 등록 또는 갱신',
      description: '앱 시작·로그인 때 호출합니다. 같은 deviceUuid가 있으면 갱신, 없으면 추가합니다. 다른 계정에 같은 푸시 토큰이 있으면 그쪽 토큰을 비우고 이 계정에 등록합니다. 학습 알림은 활성·알림 권한 허용·토큰 있는 기기로만 발송됩니다.',
      requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/DeviceRegisterRequest' } } } },
      responses: { 200: success('등록된 기기', 'Device'), 401: error('인증 필요'), 409: error('같은 기기 등록이 동시에 처리됨 (다시 시도)'), 422: error('요청 검증 실패'), 503: error('DB 연결 실패') },
    } },
    '/api/v1/users/me/devices/{deviceUuid}': { delete: {
      tags: ['Notifications'], security: auth, summary: '기기 해제 (알림 받지 않음)',
      description: '로그아웃·알림 거부 때 호출합니다. 행을 지우지 않고 비활성화하며 푸시 토큰을 비웁니다. 없는 기기여도 200입니다. 로그아웃(POST /auth/logout)은 서버에서 모든 기기를 비활성화합니다.',
      parameters: [{ name: 'deviceUuid', in: 'path', required: true, schema: deviceUuid }],
      responses: { 200: success('해제 결과', 'DeviceRemoved'), 401: error('인증 필요'), 422: error('요청 검증 실패'), 503: error('DB 연결 실패') },
    } },
  },
};
