/**
 * AI 튜터 학습 Context의 개념 검증 (#171, BE-03)
 * 백엔드 작업: 앱이 보낸 개념 코드·개념 ID가 공개(PUBLISHED)된 개념인지, 서로 같은 개념을 가리키는지 확인한다.
 * 주의: 형식(길이·중복·허용 키)은 dto/tutorRequest.dto.js가 먼저 검사한다. 여기서는 DB 존재·정합성만 본다.
 *       개념 코드는 버전과 무관한 식별자라, 같은 코드의 공개 버전이 하나라도 있으면 통과한다.
 *       AI 서버 호출·사용량 차감 전에 실행해서, 잘못된 요청은 422로 바로 돌려준다.
 */
const { In } = require('typeorm');
const { Concept, ConceptStatus } = require('@leren/database');
const AppError = require('../../common/errors/AppError');

async function assertKnownConcepts(manager, input) {
  const context = input.context || {};
  const codes = [...new Set([...(input.knowledgeScope?.conceptCodes || []), ...(context.conceptCode ? [context.conceptCode] : [])])];
  const conceptId = context.conceptId || null;
  if (!codes.length && !conceptId) return;

  const repo = manager.getRepository(Concept);
  if (codes.length) {
    const rows = await repo.find({ where: { conceptCode: In(codes), status: ConceptStatus.Published }, select: { conceptCode: true } });
    const known = new Set(rows.map(row => row.conceptCode));
    const unknown = codes.filter(code => !known.has(code));
    if (unknown.length) throw AppError.validation('공개된 개념 코드가 아닙니다.', { unknownConceptCodes: unknown });
  }
  if (conceptId) {
    const concept = await repo.findOne({ where: { conceptId, status: ConceptStatus.Published }, select: { conceptId: true, conceptCode: true } });
    if (!concept) throw AppError.validation('context.conceptId에 해당하는 공개 개념이 없습니다.', { conceptId });
    if (context.conceptCode && concept.conceptCode !== context.conceptCode) {
      throw AppError.validation('context.conceptId와 context.conceptCode가 서로 다른 개념입니다.', {
        conceptId, conceptCode: context.conceptCode, conceptCodeOfConceptId: concept.conceptCode,
      });
    }
  }
}

module.exports = { assertKnownConcepts };
