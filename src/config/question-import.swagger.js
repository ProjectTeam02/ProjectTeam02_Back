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
