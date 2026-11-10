/** Internal question-draft import contract. Provisional until agreed with the AI team. */
module.exports = {
  schemas: {
    GeneratedQuestionDraft: {
      type: 'object',
      required: ['conceptId', 'questionText', 'explanation', 'sourceDocumentIds', 'choices'],
      properties: {
        conceptId: { type: 'string', format: 'uuid' },
        questionText: { type: 'string', example: '기회비용의 의미는 무엇인가요?' },
        explanation: { type: 'string', example: '포기한 대안 중 가장 가치가 큰 것을 말합니다.' },
        keyPoint: { type: 'string', nullable: true, maxLength: 255 },
        difficulty: { type: 'string', nullable: true, enum: ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'] },
        sourceDocumentIds: { type: 'array', minItems: 1, maxItems: 20, items: { type: 'string' } },
        choices: { type: 'array', minItems: 4, maxItems: 4, items: {
          type: 'object', required: ['text', 'isCorrect'], properties: {
            text: { type: 'string', maxLength: 255 },
            isCorrect: { type: 'boolean' },
            feedbackText: { type: 'string', nullable: true, maxLength: 255 },
          },
        } },
      },
    },
  },
  paths: {
    '/api/v1/internal/questions/drafts': {
      post: {
        tags: ['Internal Question Import'],
        summary: 'AI 문제 초안 수신 및 DB 저장 (내부 인증키 필수)',
        description: '문제는 GENERATED 상태로만 저장합니다. 검수·공개·Stage 배정은 후속 작업입니다. 운영 호출은 HTTPS를 사용해야 합니다. QUESTION_IMPORT_API_KEY가 없으면 503으로 비활성화됩니다.',
        parameters: [{ name: 'x-question-import-key', in: 'header', required: true, schema: { type: 'string', format: 'password' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/GeneratedQuestionDraft' } } } },
        responses: {
          201: { description: '문제·4개 선택지 트랜잭션 저장 (비공개 GENERATED 상태)' },
          401: { description: '내부 인증 실패' },
          404: { description: '개념 ID 없음' },
          422: { description: '문제·선택지 형식 오류' },
          503: { description: '내부 인증키 미설정 또는 DB 연결 오류' },
        },
      },
    },
  },
};

module.exports.schemas.QuestionGenerationRequest = {
  type: 'object', additionalProperties: false,
  required: ['conceptId', 'topic', 'difficulty', 'questionCount', 'learningObjectives'],
  properties: {
    conceptId: { type: 'string', format: 'uuid' },
    topic: { type: 'string', minLength: 1, maxLength: 120 },
    difficulty: { type: 'string', enum: ['EASY', 'MEDIUM', 'HARD'] },
    questionCount: { type: 'integer', minimum: 1, maximum: 100 },
    learningObjectives: { type: 'array', minItems: 1, maxItems: 10, uniqueItems: true,
      items: { type: 'string', minLength: 1, maxLength: 240 } },
  },
};
module.exports.paths['/api/v1/internal/questions/generate'] = {
  post: {
    tags: ['Internal Question Import'], summary: 'AI 문제 생성 및 검수 대기 문제 일괄 저장',
    description: 'QUESTION_GENERATION_ENABLED=true 및 서버 승인 근거 파일이 필요합니다. 기존 내부 인증키를 사용합니다. 생성 작업 COMPLETED는 문제 공개를 뜻하지 않으며 문제는 REVIEW_PENDING으로만 저장됩니다. Idempotency-Key는 필수이며 동일 키·동일 내용은 저장된 결과를 재사용합니다. 진행 중 또는 다른 내용은 409입니다. 자동 재시도하지 않습니다. 실제 AI 호출 전 비용 승인을 확인하세요.',
    parameters: [{ name: 'x-question-import-key', in: 'header', required: true, schema: { type: 'string', format: 'password' } }, { name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string', minLength: 1, maxLength: 100, pattern: '^[!-~]+$' }, description: '같은 생성 작업 재요청 시 동일 키를 사용. 실패한 작업도 같은 키로 재실행하지 않음' }],
    requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/QuestionGenerationRequest' } } } },
    responses: {
      201: { description: '생성 및 트랜잭션 저장 완료 또는 최초 성공 응답 재전송', content: { 'application/json': { schema: {
        type: 'object', properties: { success: { type: 'boolean' }, data: { type: 'object', properties: {
          requestId: { type: 'string', format: 'uuid' }, status: { type: 'string', enum: ['COMPLETED'] },
          questions: { type: 'array', items: { type: 'object', properties: {
            questionId: { type: 'string', format: 'uuid' }, questionCode: { type: 'string' },
            conceptId: { type: 'string', format: 'uuid' }, status: { type: 'string', enum: ['REVIEW_PENDING'] },
            choiceCount: { type: 'integer', enum: [4] }, sourceDocumentIds: { type: 'array', items: { type: 'string' } },
          } } },
        } } },
      } } } },
      401: { description: '내부 인증 실패' }, 404: { description: '개념 없음' },
      409: { description: '동일 키 진행 중, 요청 내용 불일치 또는 다른 AI 종류의 저장 키 충돌' },
      422: { description: '생성 요청 형식 오류 또는 Idempotency-Key 누락·형식 오류' },
      503: { description: '비활성화, 근거 매핑 오류, AI 실패 또는 저장 실패' },
    },
  },
};
