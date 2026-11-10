const conceptId = '12345678-1234-4234-8234-123456789abc';
const input = (count = 1, difficulty = 'EASY') => ({ conceptId, topic: '인플레이션', difficulty,
  questionCount: count, learningObjectives: ['인플레이션의 의미를 설명할 수 있다'] });
const result = (count = 1, difficulty = 'EASY') => ({ status: 'COMPLETED', topic: '인플레이션', difficulty,
  error: null, sourceIds: ['BOK-1'], promptVersions: { qg: 'test-qg', qv: 'test-qv' },
  questions: Array.from({ length: count }, (_, i) => ({ questionType: 'CONCEPT',
    question: `인플레이션의 의미를 묻는 ${i + 1}번 문제입니다.`, choices: ['물가의 지속적 상승', '실업 감소', '금리 하락', '통화 소멸'],
    correctAnswerIndex: 0, explanation: '인플레이션은 전반적인 물가 수준이 지속적으로 상승하는 현상입니다.',
    learningObjective: '인플레이션의 의미를 설명할 수 있다', sourceIds: ['BOK-1'] })),
  validation: Array.from({ length: count }, (_, i) => ({ questionIndex: i, attempt: 1, decision: 'APPROVE',
    independentAnswerIndex: 0, issues: [], feedback: '' })),
});
const evidence = { source_id: 'BOK-1', document_id: 'DOC-1', document_version: '2026',
  review_status: 'approved', content: '인플레이션은 전반적인 물가 수준이 지속적으로 상승하는 현상입니다.' };
module.exports = { input, result, evidence };
