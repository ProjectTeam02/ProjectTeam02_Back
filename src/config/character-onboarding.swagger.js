const auth = [{ bearerAuth: [] }];
const ref = name => ({ $ref: `#/components/schemas/${name}` });
const object = properties => ({ type: 'object', required: Object.keys(properties), properties });
const json = (description, schema, example) => ({
  description, content: { 'application/json': { schema, ...(example && { example }) } },
});
const error = description => json(description, ref('Error'));
const success = data => object({ success: { type: 'boolean', example: true }, data });

const warrior = {
  classId: '123e4567-e89b-42d3-a456-426614174040', classCode: 'WARRIOR', name: '검사', imageKey: null,
};

module.exports = {
  schemas: {
    CharacterClass: object({
      classId: { type: 'string', format: 'uuid' },
      classCode: { type: 'string', enum: ['WARRIOR', 'MAGE', 'ARCHER'] },
      name: { type: 'string' },
      imageKey: { type: 'string', nullable: true },
    }),
  },
  paths: {
    '/api/v1/character-classes': { get: {
      tags: ['Users'], security: auth, summary: '활성 직업 목록 조회',
      description: '선택 가능한 활성 직업을 정렬 순서대로 반환합니다. 활성 직업이 없으면 items는 빈 배열입니다.',
      responses: {
        200: json('목록 조회', success(object({ items: { type: 'array', items: ref('CharacterClass') } })),
          { success: true, data: { items: [warrior] } }),
        401: error('유효한 사용자 인증이 필요합니다.'),
        503: error('데이터베이스를 사용할 수 없습니다.'),
      },
    } },
    '/api/v1/users/me/character-class': { patch: {
      tags: ['Users'], security: auth, summary: '내 최초 직업 선택',
      description: '로그인한 사용자의 최초 직업과 온보딩 완료 시각을 저장합니다. 같은 직업을 다시 요청하면 기존 선택을 반환합니다. 이미 선택한 사용자가 다른 활성 직업을 요청하면 409를 반환합니다.',
      requestBody: {
        required: true, content: { 'application/json': {
          schema: {
            ...object({ classCode: { type: 'string', pattern: '^[A-Z][A-Z0-9_]{0,29}$' } }),
            additionalProperties: false,
          },
          example: { classCode: 'WARRIOR' },
        } },
      },
      responses: {
        200: json('최초 저장 또는 동일 선택 재요청', success(object({
          characterClass: ref('CharacterClass'), onboardingCompleted: { type: 'boolean', example: true },
        })), { success: true, data: { characterClass: warrior, onboardingCompleted: true } }),
        401: error('유효한 사용자 인증이 필요합니다.'),
        404: error('사용자 또는 선택 가능한 직업을 찾을 수 없습니다.'),
        409: error('이미 다른 직업을 선택했습니다.'),
        422: error('요청 본문에 대문자 classCode 한 개가 필요합니다.'),
        503: error('데이터베이스를 사용할 수 없습니다.'),
      },
    } },
  },
};
