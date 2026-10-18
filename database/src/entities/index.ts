// 자동 생성: 모든 app 스키마 엔티티
import { User } from './account/users.entity';
import { SocialAccount } from './account/social-accounts.entity';
import { AccountToken } from './account/account-tokens.entity';
import { UserDevice } from './account/user-devices.entity';
import { UserSession } from './account/user-sessions.entity';
import { Job } from './character/jobs.entity';
import { Costume } from './character/costumes.entity';
import { UserCostume } from './character/user-costumes.entity';
import { UserCharacter } from './character/user-characters.entity';
import { Region } from './content/regions.entity';
import { RegionPrerequisite } from './content/region-prerequisites.entity';
import { Step } from './content/steps.entity';
import { Concept } from './content/concepts.entity';
import { ConceptSection } from './content/concept-sections.entity';
import { StepConcept } from './content/step-concepts.entity';
import { Question } from './content/questions.entity';
import { QuestionChoice } from './content/question-choices.entity';
import { StepQuestion } from './content/step-questions.entity';
import { UserStepProgress } from './progress/user-step-progress.entity';
import { LearningAttempt } from './quiz/learning-attempts.entity';
import { QuestionSubmission } from './quiz/question-submissions.entity';
import { UserGrowth } from './reward/user-growth.entity';
import { UserWallet } from './reward/user-wallets.entity';
import { ExpLedger } from './reward/exp-ledger.entity';
import { CoinLedger } from './reward/coin-ledger.entity';
import { LevelThreshold } from './reward/level-thresholds.entity';
import { ReviewItem } from './review/review-items.entity';
import { ConceptAutoReview } from './review/concept-auto-reviews.entity';
import { ReviewSession } from './review/review-sessions.entity';
import { ReviewSubmission } from './review/review-submissions.entity';
import { LearningSchedule } from './calendar/learning-schedules.entity';
import { UserSetting } from './settings/user-settings.entity';
import { AiConversation } from './ai/ai-conversations.entity';
import { AiMessage } from './ai/ai-messages.entity';
import { AiMessageSource } from './ai/ai-message-sources.entity';
import { AiRequest } from './ai/ai-requests.entity';

export const entities = [
  User,
  SocialAccount,
  AccountToken,
  UserDevice,
  UserSession,
  Job,
  Costume,
  UserCostume,
  UserCharacter,
  Region,
  RegionPrerequisite,
  Step,
  Concept,
  ConceptSection,
  StepConcept,
  Question,
  QuestionChoice,
  StepQuestion,
  UserStepProgress,
  LearningAttempt,
  QuestionSubmission,
  UserGrowth,
  UserWallet,
  ExpLedger,
  CoinLedger,
  LevelThreshold,
  ReviewItem,
  ConceptAutoReview,
  ReviewSession,
  ReviewSubmission,
  LearningSchedule,
  UserSetting,
  AiConversation,
  AiMessage,
  AiMessageSource,
  AiRequest,
];

export {
  User,
  SocialAccount,
  AccountToken,
  UserDevice,
  UserSession,
  Job,
  Costume,
  UserCostume,
  UserCharacter,
  Region,
  RegionPrerequisite,
  Step,
  Concept,
  ConceptSection,
  StepConcept,
  Question,
  QuestionChoice,
  StepQuestion,
  UserStepProgress,
  LearningAttempt,
  QuestionSubmission,
  UserGrowth,
  UserWallet,
  ExpLedger,
  CoinLedger,
  LevelThreshold,
  ReviewItem,
  ConceptAutoReview,
  ReviewSession,
  ReviewSubmission,
  LearningSchedule,
  UserSetting,
  AiConversation,
  AiMessage,
  AiMessageSource,
  AiRequest,
};
export * from './common/enums';
