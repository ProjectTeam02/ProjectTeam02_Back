# 엔티티 목록 (v3 rev.5)

`src/entities` 아래 40개 엔티티와 테이블·관계 대응표입니다. 모두 `leren_erd_v3.dbml`(rev.5)과 같은 DB를 만듭니다.

- 클래스·파일 이름: 테이블 이름의 단수형 PascalCase / kebab-case (`user_costumes` → `UserCostume`, `user-costumes.entity.ts`)
- 속성 이름: 컬럼 이름의 camelCase = API 필드 이름 (`item_id` → `itemId`, `submission_id` → `submissionId`)
- FK마다 `xxxId` 컬럼 속성과 `xxx` 관계 속성을 함께 둡니다. 관계는 소유 쪽(ManyToOne·OneToOne)만 정의했습니다.
- Enum은 `common/enums.ts` 한 파일 (48개 TS enum = DB 타입 50개, 값이 같은 2쌍은 공유)

## 계정·인증·약관 (`account/`)

| 테이블 | 엔티티 | 관계 속성 → 대상 |
| --- | --- | --- |
| `users` | `User` | — |
| `terms` | `Terms` | — |
| `user_terms_agreements` | `UserTermsAgreement` | `user` → User<br>`terms` → Terms |
| `social_accounts` | `SocialAccount` | `user` → User |
| `account_tokens` | `AccountToken` | `user` → User |
| `user_devices` | `UserDevice` | `user` → User |
| `user_sessions` | `UserSession` | `user` → User<br>`device` → UserDevice |
| `user_settings` | `UserSetting` | `user` → User (1:1) |

## 캐릭터·상점 (`character/`)

| 테이블 | 엔티티 | 관계 속성 → 대상 |
| --- | --- | --- |
| `character_classes` | `CharacterClass` | — |
| `costumes` | `Costume` | — |
| `user_characters` | `UserCharacter` | `user` → User (1:1)<br>`characterClass` → CharacterClass |
| `user_costumes` | `UserCostume` | `user` → User<br>`costume` → Costume<br>`coinLedger` → CoinLedger |
| `user_equipped_costumes` | `UserEquippedCostume` | `costume` → Costume (복합 FK)<br>`ownedCostume` → UserCostume (복합 FK) |

## 학습 콘텐츠 (`content/`)

| 테이블 | 엔티티 | 관계 속성 → 대상 |
| --- | --- | --- |
| `topics` | `Topic` | — |
| `topic_prerequisites` | `TopicPrerequisite` | `topic` → Topic<br>`prerequisiteTopic` → Topic |
| `stages` | `Stage` | `topic` → Topic |
| `concepts` | `Concept` | `topic` → Topic<br>`supersedesConcept` → Concept<br>`reviewer` → User |
| `concept_prerequisites` | `ConceptPrerequisite` | — |
| `concept_sections` | `ConceptSection` | `concept` → Concept |
| `stage_concepts` | `StageConcept` | `stage` → Stage<br>`concept` → Concept |
| `questions` | `Question` | `supersedesQuestion` → Question<br>`concept` → Concept<br>`generationRequest` → AiRequest<br>`reviewer` → User |
| `question_choices` | `QuestionChoice` | `question` → Question |
| `stage_questions` | `StageQuestion` | `stage` → Stage<br>`question` → Question |

## 진행도·퀴즈 (`progress/`)

| 테이블 | 엔티티 | 관계 속성 → 대상 |
| --- | --- | --- |
| `user_stage_progress` | `UserStageProgress` | `user` → User<br>`stage` → Stage<br>`firstPassAttempt` → LearningAttempt |
| `learning_attempts` | `LearningAttempt` | `user` → User<br>`stage` → Stage |
| `question_submissions` | `QuestionSubmission` | `attempt` → LearningAttempt<br>`question` → Question<br>`choice` → QuestionChoice (복합 FK) |

## 보상·성장 (`reward/`)

| 테이블 | 엔티티 | 관계 속성 → 대상 |
| --- | --- | --- |
| `user_growth` | `UserGrowth` | `user` → User (1:1) |
| `user_wallets` | `UserWallet` | `user` → User (1:1) |
| `exp_ledger` | `ExpLedger` | `user` → User<br>`sourceStage` → Stage<br>`attempt` → LearningAttempt |
| `coin_ledger` | `CoinLedger` | `user` → User<br>`attempt` → LearningAttempt |
| `level_thresholds` | `LevelThreshold` | — |

## 오답·복습·일정 (`review/`)

| 테이블 | 엔티티 | 관계 속성 → 대상 |
| --- | --- | --- |
| `review_items` | `ReviewItem` | `user` → User<br>`latestQuestion` → Question<br>`sourceStage` → Stage |
| `review_missions` | `ReviewMission` | `user` → User |
| `review_attempts` | `ReviewAttempt` | `user` → User<br>`mission` → ReviewMission |
| `review_submissions` | `ReviewSubmission` | `reviewAttempt` → ReviewAttempt<br>`reviewItem` → ReviewItem<br>`question` → Question<br>`choice` → QuestionChoice (복합 FK) |
| `study_plans` | `StudyPlan` | `user` → User<br>`stage` → Stage<br>`concept` → Concept |

## AI Tutor (멀티턴 RAG) (`ai/`)

| 테이블 | 엔티티 | 관계 속성 → 대상 |
| --- | --- | --- |
| `ai_conversations` | `AiConversation` | `user` → User<br>`contextTopic` → Topic<br>`contextStage` → Stage<br>`contextConcept` → Concept<br>`contextQuestion` → Question<br>`contextAttempt` → LearningAttempt |
| `ai_messages` | `AiMessage` | `conversation` → AiConversation<br>`parentMessage` → AiMessage<br>`contextStage` → Stage<br>`contextConcept` → Concept<br>`request` → AiRequest |
| `ai_message_sources` | `AiMessageSource` | `message` → AiMessage |
| `ai_requests` | `AiRequest` | `user` → User<br>`conversation` → AiConversation |
