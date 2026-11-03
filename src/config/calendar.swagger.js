const uuid = { type: 'string', format: 'uuid' };
const date = { type: 'string', format: 'date', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'Asia/Seoul 기준 달력 날짜. 시각 없이 YYYY-MM-DD, 실제 존재하는 날짜' };
const inputFields = {
  scheduledDate: date,
  topicId: { ...uuid, description: '선택한 Stage/Concept의 소속 Topic. 목표와 별도로 검증' },
  stageId: { ...uuid, nullable: true },
  conceptId: { ...uuid, nullable: true },
  planType: { type: 'string', enum: ['NEW_LEARNING', 'REVIEW'] },
  goal: { type: 'string', minLength: 1, maxLength: 30, description: '나의 목표. 앞뒤 공백 제거 후 1~30 Unicode 문자. StudyPlan.title에 저장' },
};
const error = description => ({ description, content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } });
const body = name => ({ required: true, content: { 'application/json': { schema: { $ref: `#/components/schemas/${name}` } } } });
const success = (description, name) => ({ description, content: { 'application/json': { schema: { $ref: `#/components/schemas/${name}` } } } });
const parameters = [{ name: 'planId', in: 'path', required: true, schema: uuid }];
const commonErrors = { 401: error('JWT가 없거나 유효한 세션이 아님'), 422: error('날짜/UUID/유형/목표/필드 또는 콘텐츠·주제 관계 검증 실패'), 503: error('DB 연결/쿼리 실패') };

module.exports = {
  schemas: {
    ScheduleCreateRequest: {
      type: 'object', additionalProperties: false, required: ['scheduledDate', 'topicId', 'planType', 'goal'],
      properties: inputFields,
      anyOf: [
        { required: ['stageId'], properties: { stageId: { ...uuid, nullable: false } } },
        { required: ['conceptId'], properties: { conceptId: { ...uuid, nullable: false } } },
      ],
      description: 'Stage 또는 Concept 하나 이상이 필요합니다. 둘 다 있으면 StageConcept 연결도 검사합니다. Topic만 받는 일정은 현 DB로 보존할 수 없어 422입니다.',
    },
    SchedulePatchRequest: {
      type: 'object', additionalProperties: false, minProperties: 1, properties: inputFields,
      description: '전달하지 않은 필드는 유지합니다. stageId/conceptId의 null은 해당 참조 제거이며, 최종적으로 하나 이상 남아야 합니다. topicId만 변경하여 기존 참조와 불일치하게 만들 수 없습니다. status/completedAt/userId/title은 요청할 수 없습니다.',
    },
    Schedule: {
      type: 'object', required: ['planId', 'scheduledDate', 'topic', 'stageId', 'conceptId', 'planType', 'goal', 'status', 'completedAt', 'createdAt', 'updatedAt'],
      properties: {
        planId: uuid, scheduledDate: date,
        topic: { type: 'object', required: ['topicId', 'title'], properties: { topicId: uuid, title: { type: 'string', description: '학습 주제 이름. 목표가 아님' } } },
        stageId: { ...uuid, nullable: true }, conceptId: { ...uuid, nullable: true },
        planType: inputFields.planType, goal: inputFields.goal,
        status: { type: 'string', enum: ['PLANNED', 'DONE'], description: '추가는 PLANNED. 이 API는 학습 완료 상태를 변경하지 않음' },
        completedAt: { type: 'string', format: 'date-time', nullable: true },
        createdAt: { type: 'string', format: 'date-time' }, updatedAt: { type: 'string', format: 'date-time' },
      },
    },
    ScheduleResponse: { type: 'object', required: ['success', 'data'], properties: { success: { type: 'boolean', example: true }, data: { $ref: '#/components/schemas/Schedule' } } },
    ScheduleDeleteResponse: { type: 'object', required: ['success', 'data'], properties: {
      success: { type: 'boolean', example: true },
      data: { type: 'object', required: ['planId', 'deleted', 'deletedAt'], properties: { planId: uuid, deleted: { type: 'boolean', example: true }, deletedAt: { type: 'string', format: 'date-time' } } },
    } },
  },
  paths: {
    '/api/v1/calendar/plans': { post: {
      tags: ['Calendar'], security: [{ bearerAuth: [] }], summary: '학습 일정 추가',
      description: '사용자 ID는 JWT에서 가져옵니다. 선택한 Stage/Concept을 통해 주제를 보존하며 목표는 별도 필드에 저장합니다. 날짜에 과거/미래 제한은 두지 않습니다.',
      requestBody: body('ScheduleCreateRequest'), responses: { 201: success('일정 생성', 'ScheduleResponse'), ...commonErrors },
    } },
    '/api/v1/calendar/plans/{planId}': {
      patch: {
        tags: ['Calendar'], security: [{ bearerAuth: [] }], summary: '내 학습 일정 부분 수정', parameters,
        description: '본인의 삭제되지 않은 일정만 수정합니다. 완료 상태는 유지합니다.', requestBody: body('SchedulePatchRequest'),
        responses: { 200: success('수정된 일정', 'ScheduleResponse'), ...commonErrors, 404: error('일정 없음/타인 소유/이미 삭제됨을 동일하게 처리') },
      },
      delete: {
        tags: ['Calendar'], security: [{ bearerAuth: [] }], summary: '내 학습 일정 소프트 삭제', parameters,
        description: 'StudyPlan.deletedAt만 기록합니다. 학습·퀴즈·복습 기록은 삭제하지 않습니다. 반복 삭제는 404입니다.',
        responses: { 200: success('삭제 결과', 'ScheduleDeleteResponse'), ...commonErrors, 404: error('일정 없음/타인 소유/이미 삭제됨을 동일하게 처리') },
      },
    },
  },
};
