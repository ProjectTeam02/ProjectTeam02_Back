// 자동 생성: leren_erd_v2.dbml 기준. 앱·AI 서버와 공유하는 단일 Enum 정의

export enum UserRole {
  User = 'user',
  Admin = 'admin',
}

export enum UserPlan {
  Free = 'free',
  Premium = 'premium',
}

export enum AccountStatus {
  Active = 'active',
  Suspended = 'suspended',
  Locked = 'locked',
}

export enum LoginMethod {
  Email = 'email',
  Kakao = 'kakao',
  Naver = 'naver',
  Google = 'google',
  Apple = 'apple',
}

export enum SocialProvider {
  Kakao = 'kakao',
  Naver = 'naver',
  Google = 'google',
  Apple = 'apple',
}

export enum TokenType {
  EmailVerification = 'email_verification',
  PasswordReset = 'password_reset',
}

export enum DevicePlatform {
  Ios = 'ios',
  Android = 'android',
}

export enum SessionRevokeReason {
  Logout = 'logout',
  Expired = 'expired',
  Rotated = 'rotated',
  Security = 'security',
}

export enum JobCode {
  Warrior = 'warrior',
  Mage = 'mage',
  Archer = 'archer',
}

export enum CostumeAcquireType {
  Default = 'default',
  Purchase = 'purchase',
}

export enum PublishStatus {
  Draft = 'draft',
  Published = 'published',
  Archived = 'archived',
}

export enum ConceptStatus {
  Draft = 'draft',
  ReviewPending = 'review_pending',
  Published = 'published',
  Archived = 'archived',
}

export enum StepType {
  Normal = 'normal',
  Boss = 'boss',
}

export enum SectionType {
  Intro = 'intro',
  Definition = 'definition',
  Example = 'example',
  Summary = 'summary',
  Remember = 'remember',
  QuizGuide = 'quiz_guide',
}

export enum CardTone {
  Default = 'default',
  Info = 'info',
  Example = 'example',
  Success = 'success',
}

export enum QuestionType {
  MultipleChoice = 'multiple_choice',
}

export enum Difficulty {
  Beginner = 'beginner',
  Intermediate = 'intermediate',
  Advanced = 'advanced',
}

export enum GeneratedBy {
  Ai = 'ai',
  Manual = 'manual',
}

export enum QuestionStatus {
  Generated = 'generated',
  AutoValidated = 'auto_validated',
  ReviewPending = 'review_pending',
  Approved = 'approved',
  Rejected = 'rejected',
  Published = 'published',
  Retired = 'retired',
}

export enum ProgressStatus {
  NotStarted = 'not_started',
  InProgress = 'in_progress',
  Passed = 'passed',
}

export enum AttemptType {
  Play = 'play',
  Replay = 'replay',
}

export enum AttemptStatus {
  InProgress = 'in_progress',
  Passed = 'passed',
  Failed = 'failed',
  Abandoned = 'abandoned',
}

export enum AttemptEndReason {
  MonsterDefeated = 'monster_defeated',
  QuestionsExhausted = 'questions_exhausted',
  Abandoned = 'abandoned',
}

export enum ExpSourceType {
  StepFirstClear = 'step_first_clear',
}

export enum CoinTransactionType {
  Earn = 'earn',
  Spend = 'spend',
}

export enum CoinReason {
  StepFirstClear = 'step_first_clear',
  CostumePurchase = 'costume_purchase',
}

export enum CoinRefType {
  Step = 'step',
  Costume = 'costume',
}

export enum LevelScope {
  Account = 'account',
  Economy = 'economy',
}

export enum ReviewFirstReason {
  Wrong = 'wrong',
  Confusing = 'confusing',
}

export enum AnswerResult {
  Correct = 'correct',
  Wrong = 'wrong',
}

export enum AutoReviewStatus {
  Scheduled = 'scheduled',
  Available = 'available',
  InProgress = 'in_progress',
  Completed = 'completed',
}

export enum ReviewSessionType {
  Auto = 'auto',
  Recommended = 'recommended',
  Single = 'single',
}

export enum ReviewEntryPoint {
  Home = 'home',
  ReviewNote = 'review_note',
  Result = 'result',
  Calendar = 'calendar',
}

export enum ReviewSessionStatus {
  InProgress = 'in_progress',
  Completed = 'completed',
  Abandoned = 'abandoned',
}

export enum ScheduleType {
  NewLearning = 'new_learning',
  Review = 'review',
}

export enum ScheduleStatus {
  Planned = 'planned',
  Done = 'done',
}

export enum AiEntryPoint {
  Nav = 'nav',
  Concept = 'concept',
  Quiz = 'quiz',
  Result = 'result',
  Review = 'review',
}

export enum ConversationStatus {
  Active = 'active',
  Archived = 'archived',
}

export enum MessageRole {
  User = 'user',
  Assistant = 'assistant',
}

export enum MessageInputType {
  Typed = 'typed',
  Suggested = 'suggested',
}

export enum MessageStatus {
  Pending = 'pending',
  Completed = 'completed',
  Failed = 'failed',
}

export enum GroundingStatus {
  Grounded = 'grounded',
  Insufficient = 'insufficient',
}

export enum AiRequestType {
  Tutor = 'tutor',
  QuestionGen = 'question_gen',
}

export enum AiRequestStatus {
  Reserved = 'reserved',
  Succeeded = 'succeeded',
  Failed = 'failed',
  Released = 'released',
}

export enum ModelTier {
  Basic = 'basic',
  Advanced = 'advanced',
}

