// 자동 생성: leren_erd.dbml (rev.5) 기준. 앱·AI 서버와 공유하는 Enum 정의
// 값은 모두 대문자 SNAKE_CASE이며 API에서도 같은 값을 그대로 주고받는다.

/** 권한 — DB 타입: user_role */
export enum UserRole {
  User = 'USER',
  Admin = 'ADMIN',
}

/** 요금제 (AI Tutor 일일 한도 기준) — DB 타입: user_plan */
export enum UserPlan {
  Free = 'FREE',
  Premium = 'PREMIUM',
}

/** 계정 상태 — DB 타입: account_status */
export enum AccountStatus {
  Active = 'ACTIVE',
  Suspended = 'SUSPENDED',
  Locked = 'LOCKED',
  Withdrawn = 'WITHDRAWN',
}

/** 로그인 방식 — DB 타입: users_last_login_method, user_sessions_login_method */
export enum LoginMethod {
  Email = 'EMAIL',
  Kakao = 'KAKAO',
  Naver = 'NAVER',
  Google = 'GOOGLE',
  Apple = 'APPLE',
}

/** 약관 종류 (SERVICE·PRIVACY·AGE_OVER_14 필수, MARKETING 선택) — DB 타입: terms_type */
export enum TermsType {
  Service = 'SERVICE',
  Privacy = 'PRIVACY',
  AgeOver14 = 'AGE_OVER_14',
  Marketing = 'MARKETING',
}

/** 소셜 로그인 제공자 — DB 타입: social_provider */
export enum SocialProvider {
  Kakao = 'KAKAO',
  Naver = 'NAVER',
  Google = 'GOOGLE',
  Apple = 'APPLE',
}

/** 계정 토큰 종류 — DB 타입: token_type */
export enum TokenType {
  EmailVerification = 'EMAIL_VERIFICATION',
  PasswordReset = 'PASSWORD_RESET',
}

/** 기기 플랫폼 — DB 타입: device_platform */
export enum DevicePlatform {
  Ios = 'IOS',
  Android = 'ANDROID',
}

/** 세션 폐기 사유 — DB 타입: session_revoke_reason */
export enum SessionRevokeReason {
  Logout = 'LOGOUT',
  Expired = 'EXPIRED',
  Rotated = 'ROTATED',
  Security = 'SECURITY',
}

/** 직업 (API classId) — DB 타입: class_code */
export enum ClassCode {
  Warrior = 'WARRIOR',
  Mage = 'MAGE',
  Archer = 'ARCHER',
}

/** 코스튬 부위 (상의·하의, API category) — DB 타입: costume_category */
export enum CostumeCategory {
  Top = 'TOP',
  Bottom = 'BOTTOM',
}

/** 코스튬 획득 방식 — DB 타입: costume_acquire_type */
export enum CostumeAcquireType {
  Default = 'DEFAULT',
  Purchase = 'PURCHASE',
}

/** 공개 상태 (topics·stages 공통) — DB 타입: topics_status, stages_status */
export enum PublishStatus {
  Draft = 'DRAFT',
  Published = 'PUBLISHED',
  Archived = 'ARCHIVED',
}

/** Stage 종류 (BOSS = API bossId) — DB 타입: stage_type */
export enum StageType {
  Normal = 'NORMAL',
  Boss = 'BOSS',
}

/** 개념 검수·공개 상태 — DB 타입: concept_status */
export enum ConceptStatus {
  Draft = 'DRAFT',
  ReviewPending = 'REVIEW_PENDING',
  Published = 'PUBLISHED',
  Archived = 'ARCHIVED',
}

/** 학습 카드 종류 — DB 타입: section_type */
export enum SectionType {
  Intro = 'INTRO',
  Definition = 'DEFINITION',
  Example = 'EXAMPLE',
  Summary = 'SUMMARY',
  Remember = 'REMEMBER',
  QuizGuide = 'QUIZ_GUIDE',
}

/** 학습 카드 색조 — DB 타입: card_tone */
export enum CardTone {
  Default = 'DEFAULT',
  Info = 'INFO',
  Example = 'EXAMPLE',
  Success = 'SUCCESS',
}

/** 문항 유형 — DB 타입: question_type */
export enum QuestionType {
  MultipleChoice = 'MULTIPLE_CHOICE',
}

/** 난이도 — DB 타입: difficulty */
export enum Difficulty {
  Beginner = 'BEGINNER',
  Intermediate = 'INTERMEDIATE',
  Advanced = 'ADVANCED',
}

/** 문항 생성 방식 — DB 타입: generated_by */
export enum GeneratedBy {
  Ai = 'AI',
  Manual = 'MANUAL',
}

/** 문항 검수·공개 상태 — DB 타입: question_status */
export enum QuestionStatus {
  Generated = 'GENERATED',
  AutoValidated = 'AUTO_VALIDATED',
  ReviewPending = 'REVIEW_PENDING',
  Approved = 'APPROVED',
  Rejected = 'REJECTED',
  Published = 'PUBLISHED',
  Retired = 'RETIRED',
}

/** Stage 진행 상태 — DB 타입: progress_status */
export enum ProgressStatus {
  NotStarted = 'NOT_STARTED',
  InProgress = 'IN_PROGRESS',
  Passed = 'PASSED',
}

/** 응시 종류 (RELEARN = 재학습, 보상 없음) — DB 타입: attempt_type */
export enum AttemptType {
  Play = 'PLAY',
  Relearn = 'RELEARN',
}

/** 응시 시작 방식 (API mode) — DB 타입: attempt_mode */
export enum AttemptMode {
  Start = 'START',
  Retry = 'RETRY',
}

/** 응시 상태 — DB 타입: attempt_status */
export enum AttemptStatus {
  InProgress = 'IN_PROGRESS',
  Passed = 'PASSED',
  Failed = 'FAILED',
  Abandoned = 'ABANDONED',
}

/** 응시 종료 사유 — DB 타입: attempt_end_reason */
export enum AttemptEndReason {
  MonsterDefeated = 'MONSTER_DEFEATED',
  QuestionsExhausted = 'QUESTIONS_EXHAUSTED',
  Abandoned = 'ABANDONED',
}

/** EXP 지급 사유 — DB 타입: exp_source_type */
export enum ExpSourceType {
  StageFirstClear = 'STAGE_FIRST_CLEAR',
}

/** 코인 지급/차감 — DB 타입: coin_transaction_type */
export enum CoinTransactionType {
  Earn = 'EARN',
  Spend = 'SPEND',
}

/** 코인 사유 — DB 타입: coin_reason */
export enum CoinReason {
  StageFirstClear = 'STAGE_FIRST_CLEAR',
  CostumePurchase = 'COSTUME_PURCHASE',
}

/** 코인 참조 대상 종류 — DB 타입: coin_ref_type */
export enum CoinRefType {
  Stage = 'STAGE',
  Costume = 'COSTUME',
}

/** 레벨 종류 — DB 타입: level_scope */
export enum LevelScope {
  Account = 'ACCOUNT',
  Economy = 'ECONOMY',
}

/** 오답·북마크 최초 등록 사유 (API source) — DB 타입: review_first_reason */
export enum ReviewFirstReason {
  Wrong = 'WRONG',
  Bookmark = 'BOOKMARK',
}

/** 풀이 결과 — DB 타입: answer_result */
export enum AnswerResult {
  Correct = 'CORRECT',
  Wrong = 'WRONG',
}

/** 잔당 소탕 임무 상태 — DB 타입: review_mission_status */
export enum ReviewMissionStatus {
  Scheduled = 'SCHEDULED',
  Available = 'AVAILABLE',
  InProgress = 'IN_PROGRESS',
  Completed = 'COMPLETED',
}

/** 복습 종류 — DB 타입: review_attempt_type */
export enum ReviewAttemptType {
  Auto = 'AUTO',
  Recommended = 'RECOMMENDED',
  Single = 'SINGLE',
}

/** 복습 진입 화면 — DB 타입: review_entry_point */
export enum ReviewEntryPoint {
  Home = 'HOME',
  ReviewNote = 'REVIEW_NOTE',
  Result = 'RESULT',
  Calendar = 'CALENDAR',
}

/** 복습 상태 — DB 타입: review_attempt_status */
export enum ReviewAttemptStatus {
  InProgress = 'IN_PROGRESS',
  Completed = 'COMPLETED',
  Abandoned = 'ABANDONED',
}

/** 학습 일정 종류 — DB 타입: plan_type */
export enum PlanType {
  NewLearning = 'NEW_LEARNING',
  Review = 'REVIEW',
}

/** 학습 일정 상태 — DB 타입: plan_status */
export enum PlanStatus {
  Planned = 'PLANNED',
  Done = 'DONE',
}

/** AI Tutor 진입 위치 — DB 타입: ai_entry_point */
export enum AiEntryPoint {
  Nav = 'NAV',
  Concept = 'CONCEPT',
  Quiz = 'QUIZ',
  Result = 'RESULT',
  Review = 'REVIEW',
}

/** 대화 상태 — DB 타입: conversation_status */
export enum ConversationStatus {
  Active = 'ACTIVE',
  Archived = 'ARCHIVED',
}

/** 메시지 작성자 — DB 타입: message_role */
export enum MessageRole {
  User = 'USER',
  Assistant = 'ASSISTANT',
}

/** 질문 입력 방식 — DB 타입: message_input_type */
export enum MessageInputType {
  Typed = 'TYPED',
  Suggested = 'SUGGESTED',
}

/** 메시지 처리 상태 — DB 타입: message_status */
export enum MessageStatus {
  Pending = 'PENDING',
  Completed = 'COMPLETED',
  Failed = 'FAILED',
}

/** 근거 충분 여부 (API 검색 상태) — DB 타입: grounding_status */
export enum GroundingStatus {
  Grounded = 'GROUNDED',
  Insufficient = 'INSUFFICIENT',
}

/** AI 요청 종류 (일일 한도는 TUTOR만 집계) — DB 타입: ai_request_type */
export enum AiRequestType {
  Tutor = 'TUTOR',
  QuestionGen = 'QUESTION_GEN',
  Summarize = 'SUMMARIZE',
}

/** AI 요청 처리 상태 — DB 타입: ai_request_status */
export enum AiRequestStatus {
  Reserved = 'RESERVED',
  Succeeded = 'SUCCEEDED',
  Failed = 'FAILED',
  Released = 'RELEASED',
}

/** 모델 등급 — DB 타입: model_tier */
export enum ModelTier {
  Basic = 'BASIC',
  Advanced = 'ADVANCED',
}
