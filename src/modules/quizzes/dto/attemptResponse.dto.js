/**
 * 퀴즈 응시·문항 응답 데이터 형식 파일
 * 대상: POST /quizzes/stages/:stageId/attempts, GET /quizzes/attempts/:attemptId, GET /quizzes/generate(레거시)
 * 백엔드 작업: LearningAttempt·Question·QuestionChoice 엔티티를 앱에 보낼 형태로 변환
 * 주의: 기존 응답 필드명과 JSON 구조 유지. 제출 전에는 정답 여부(isCorrect)와 해설을 내보내지 않는다.
 *
 * question (currentQuestion)
 *   id          uuid     questionId
 *   title       string   문항 본문 (questions.question_text)
 *   difficulty  string
 *   conceptId   uuid
 *   choices     { id: choiceId, label: 'A'~'D' (base_order), content: choice_text }[]
 *
 * attempt (summary)
 *   attemptId, stageId          uuid
 *   status                      'IN_PROGRESS' | 'PASSED' | 'FAILED' | 'ABANDONED'
 *   mode                        'START' | 'RETRY'
 *   attemptNo                   number
 *   maxQuestionCount, submittedCount, correctCount   number
 *   hp                          number  현재 몬스터 HP (final_hp, 아직 제출 전이면 initial_hp)
 *   endReason                   'MONSTER_DEFEATED' | 'QUESTIONS_EXHAUSTED' | null
 *   endedAt                     ISO 시각 | null
 *   rewardGranted               boolean  최초 통과 보상 지급 여부
 *
 * 응시 시작·조회 data: attempt + { currentQuestion: question | null (종료 후 null) }
 *   응시 시작만 resumed: boolean (진행 중 응시를 이어서 열었으면 true, 200 / 새로 만들었으면 false, 201)
 * 레거시 조회 data: question + { explanation: null }
 */
const { iso } = require('../../../common/dto/fields');

function question(entity, choices) {
  return {
    id: entity.questionId,
    title: entity.questionText,
    difficulty: entity.difficulty,
    conceptId: entity.conceptId,
    choices: choices.map(choice => ({
      id: choice.choiceId,
      label: String.fromCharCode(64 + choice.baseOrder),
      content: choice.choiceText,
    })),
  };
}

/** GET /quizzes/generate: 기존 응답에 있던 explanation 키는 유지하되 값은 항상 null */
function legacyQuestion(entity, choices) {
  const { id, title, difficulty, conceptId, choices: mapped } = question(entity, choices);
  return { id, title, explanation: null, difficulty, conceptId, choices: mapped };
}

function summary(attempt) {
  return {
    attemptId: attempt.attemptId,
    stageId: attempt.stageId,
    status: attempt.status,
    mode: attempt.mode,
    attemptNo: attempt.attemptNo,
    maxQuestionCount: attempt.maxQuestionCount,
    submittedCount: attempt.submittedCount,
    correctCount: attempt.correctCount,
    hp: attempt.finalHp ?? attempt.initialHp,
    endReason: attempt.endReason ?? null,
    endedAt: iso(attempt.endedAt),
    rewardGranted: Boolean(attempt.rewardGranted),
  };
}

function view(attempt, currentQuestion) {
  return { ...summary(attempt), currentQuestion };
}

function started(attempt, currentQuestion, resumed) {
  return { ...view(attempt, currentQuestion), resumed };
}

module.exports = { question, legacyQuestion, summary, view, started };
