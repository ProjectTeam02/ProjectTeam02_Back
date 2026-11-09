// 자동 생성: app 스키마 엔티티 46개 (leren_erd.dbml rev.8)
import { User } from './account/users.entity';
import { Terms } from './account/terms.entity';
import { UserTermsAgreement } from './account/user-terms-agreements.entity';
import { SocialAccount } from './account/social-accounts.entity';
import { AccountToken } from './account/account-tokens.entity';
import { UserDevice } from './account/user-devices.entity';
import { UserSession } from './account/user-sessions.entity';
import { UserSetting } from './account/user-settings.entity';
import { CharacterClass } from './character/character-classes.entity';
import { Costume } from './character/costumes.entity';
import { UserCharacter } from './character/user-characters.entity';
import { UserCostume } from './character/user-costumes.entity';
import { UserEquippedCostume } from './character/user-equipped-costumes.entity';
import { Topic } from './content/topics.entity';
import { TopicPrerequisite } from './content/topic-prerequisites.entity';
import { Stage } from './content/stages.entity';
import { Concept } from './content/concepts.entity';
import { ConceptPrerequisite } from './content/concept-prerequisites.entity';
import { ConceptSection } from './content/concept-sections.entity';
import { StageConcept } from './content/stage-concepts.entity';
import { Question } from './content/questions.entity';
import { QuestionChoice } from './content/question-choices.entity';
import { StageQuestion } from './content/stage-questions.entity';
import { GlossaryTerm } from './content/glossary-terms.entity';
import { ConceptTerm } from './content/concept-terms.entity';
import { UserStageProgress } from './progress/user-stage-progress.entity';
import { LearningAttempt } from './progress/learning-attempts.entity';
import { QuestionSubmission } from './progress/question-submissions.entity';
import { UserGrowth } from './reward/user-growth.entity';
import { UserWallet } from './reward/user-wallets.entity';
import { ExpLedger } from './reward/exp-ledger.entity';
import { CoinLedger } from './reward/coin-ledger.entity';
import { LevelThreshold } from './reward/level-thresholds.entity';
import { Badge } from './reward/badges.entity';
import { UserBadge } from './reward/user-badges.entity';
import { ReviewItem } from './review/review-items.entity';
import { ReviewMission } from './review/review-missions.entity';
import { ReviewAttempt } from './review/review-attempts.entity';
import { ReviewSubmission } from './review/review-submissions.entity';
import { StudyPlan } from './review/study-plans.entity';
import { AiConversation } from './ai/ai-conversations.entity';
import { AiMessage } from './ai/ai-messages.entity';
import { AiMessageSource } from './ai/ai-message-sources.entity';
import { AiRequest } from './ai/ai-requests.entity';
import { AiConversationSummary } from './ai/ai-conversation-summaries.entity';
import { AiUserMemory } from './ai/ai-user-memories.entity';

export const entities = [
  User,
  Terms,
  UserTermsAgreement,
  SocialAccount,
  AccountToken,
  UserDevice,
  UserSession,
  UserSetting,
  CharacterClass,
  Costume,
  UserCharacter,
  UserCostume,
  UserEquippedCostume,
  Topic,
  TopicPrerequisite,
  Stage,
  Concept,
  ConceptPrerequisite,
  ConceptSection,
  StageConcept,
  Question,
  QuestionChoice,
  StageQuestion,
  GlossaryTerm,
  ConceptTerm,
  UserStageProgress,
  LearningAttempt,
  QuestionSubmission,
  UserGrowth,
  UserWallet,
  ExpLedger,
  CoinLedger,
  LevelThreshold,
  Badge,
  UserBadge,
  ReviewItem,
  ReviewMission,
  ReviewAttempt,
  ReviewSubmission,
  StudyPlan,
  AiConversation,
  AiMessage,
  AiMessageSource,
  AiRequest,
  AiConversationSummary,
  AiUserMemory,
];

export {
  User,
  Terms,
  UserTermsAgreement,
  SocialAccount,
  AccountToken,
  UserDevice,
  UserSession,
  UserSetting,
  CharacterClass,
  Costume,
  UserCharacter,
  UserCostume,
  UserEquippedCostume,
  Topic,
  TopicPrerequisite,
  Stage,
  Concept,
  ConceptPrerequisite,
  ConceptSection,
  StageConcept,
  Question,
  QuestionChoice,
  StageQuestion,
  GlossaryTerm,
  ConceptTerm,
  UserStageProgress,
  LearningAttempt,
  QuestionSubmission,
  UserGrowth,
  UserWallet,
  ExpLedger,
  CoinLedger,
  LevelThreshold,
  Badge,
  UserBadge,
  ReviewItem,
  ReviewMission,
  ReviewAttempt,
  ReviewSubmission,
  StudyPlan,
  AiConversation,
  AiMessage,
  AiMessageSource,
  AiRequest,
  AiConversationSummary,
  AiUserMemory,
};

export * from './common/enums';
