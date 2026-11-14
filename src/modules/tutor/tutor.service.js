/**
 * AI Tutor 비즈니스 로직
 * 백엔드 작업: 유스케이스 흐름과 기존 정책을 유지
 * 주의: DB는 Repository, 외부 통신은 Client를 사용한다.
 */
const crypto = require('node:crypto');
const { In } = require('typeorm');
const { AiConversation, AiMessage, AiMessageSource, AiRequest } = require('@leren/database');
const { AppDataSource } = require('../../config/database');
const AppError = require('../../common/errors/AppError');
const FastApiClient = require('../../clients/fastapi.client');
const env = require('../../config/env');
const quotaService = require('./quota.service');
const conversationDto = require('./dto/conversationResponse.dto');
const messageDto = require('./dto/tutorResponse.dto');
const aiRequestDto = require('./dto/aiInternalRequest.dto');
const aiResponseDto = require('./dto/aiInternalResponse.dto');

// #99 같은 대화방·같은 사용자 요청을 트랜잭션 안에서 순서대로 처리 (트랜잭션이 끝나면 자동 해제)
async function advisoryLock(manager, key) {
  if (typeof manager.query === 'function') await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [key]);
}

// #99 ai_requests.idempotency_key는 전체 유니크라, 튜터 키는 대화방 단위로 구분한 해시로 저장 (6 + 64 = 70자)
//   clientMessageId는 대화방 안에서만 유니크하므로, 다른 대화방에서 같은 값을 써도 충돌하지 않게 한다
function tutorKey(conversationId, clientMessageId) {
  return `TUTOR:${crypto.createHash('sha256').update(`${conversationId}:${clientMessageId}`).digest('hex')}`;
}

// 동시 요청에서 나는 유니크 위반 → 409
const CONCURRENT_CONSTRAINTS = new Set(['uq_ai_messages_one_pending_answer', 'ai_messages_conversation_id_sequence_no_idx',
  'ai_messages_conversation_id_client_message_id_idx', 'ai_requests_idempotency_key_key']);
function uniqueViolation(error) {
  const code = error?.driverError?.code ?? error?.code;
  return code === '23505' ? (error?.driverError?.constraint ?? error?.constraint ?? null) : null;
}

function tutorService(dataSource = AppDataSource, aiClient = new FastApiClient()) {
  const quota = quotaService(dataSource);
  const repoFor = (entity, manager = dataSource.manager) => manager.getRepository(entity);

  async function ownedConversation(userId, conversationId, manager = dataSource.manager) {
    const conversation = await repoFor(AiConversation, manager).findOneBy({ conversationId, userId });
    if (!conversation) throw AppError.notFound('대화방을 찾을 수 없습니다.');
    return conversation;
  }

  async function sourcesFor(messages, manager) {
    const byMessage = new Map();
    if (!messages.length) return byMessage;
    const sources = await repoFor(AiMessageSource, manager).findBy({ messageId: In(messages.map((item) => item.messageId)) });
    for (const source of sources) byMessage.set(source.messageId, [...(byMessage.get(source.messageId) || []), source]);
    return byMessage;
  }

  return {
    async createConversation(userId, input) {
      const repo = repoFor(AiConversation);
      const conversation = repo.create({ userId, entryPoint: input.entryPoint || null, contextTopicId: input.contextTopicId || null, contextStageId: input.contextStageId || null, contextConceptId: input.contextConceptId || null });
      return conversationDto.conversation(await repo.save(conversation));
    },
    async listConversations(userId, { skip, take, page, pageSize }) {
      const repo = repoFor(AiConversation);
      const [items, total] = await repo.findAndCount({ where: { userId }, order: { updatedAt: 'DESC' }, skip, take });
      return conversationDto.list({ items, total }, { page, pageSize });
    },
    async messages(userId, conversationId, { skip, take, page, pageSize }) {
      await ownedConversation(userId, conversationId);
      const repo = repoFor(AiMessage);
      const [items, total] = await repo.findAndCount({ where: { conversationId }, order: { sequenceNo: 'ASC' }, skip, take });
      return messageDto.list({ items, total }, await sourcesFor(items, dataSource.manager), { page, pageSize });
    },
    async sendMessage(userId, input, idempotencyKey) {
      const conversation = await ownedConversation(userId, input.conversationId);
      const clientMessageId = input.clientMessageId || idempotencyKey || null;
      const messageRepo = repoFor(AiMessage);
      if (clientMessageId) {
        const previous = await messageRepo.findOneBy({ conversationId: conversation.conversationId, clientMessageId });
        if (previous) {
          if (previous.content !== input.question) throw AppError.conflict('Idempotency-Key가 다른 질문에 이미 사용되었습니다.');
          const assistant = await messageRepo.findOneBy({ conversationId: conversation.conversationId, parentMessageId: previous.messageId, role: 'ASSISTANT' });
          if (assistant?.status === 'COMPLETED') {
            const sources = await sourcesFor([assistant], dataSource.manager);
            return messageDto.sendResult({ userMessage: previous, assistantMessage: assistant, assistantSources: sources.get(assistant.messageId) || [], duplicate: true });
          }
          if (previous.status === 'FAILED' || assistant?.status === 'FAILED') {
            throw AppError.conflict('이전 요청이 실패했습니다. 새 clientMessageId로 다시 요청해 주세요.');
          }
          throw AppError.conflict('동일한 요청이 이미 처리 중입니다.');
        }
      }

      // #99 (1) 한 트랜잭션: 한도 예약 + USER 메시지 + ASSISTANT PENDING 행
      //   같은 대화방 요청은 잠금으로 순서대로 처리하고, 이미 답변 생성 중이면 uq_ai_messages_one_pending_answer로 409
      const requestId = crypto.randomUUID();
      let quotaResult, aiRequest, userMessage, assistantMessage;
      try {
        await dataSource.transaction(async (manager) => {
          await advisoryLock(manager, `tutor:conversation:${conversation.conversationId}`);
          quotaResult = await quota.reserve(userId, { requestId, userId, conversationId: conversation.conversationId, requestType: 'TUTOR', status: 'RESERVED', modelTier: input.modelTier, idempotencyKey: clientMessageId ? tutorKey(conversation.conversationId, clientMessageId) : null }, manager);
          const messages = repoFor(AiMessage, manager);
          const [last] = await messages.find({ where: { conversationId: conversation.conversationId }, order: { sequenceNo: 'DESC' }, take: 1 });
          const sequenceNo = last ? last.sequenceNo + 1 : 1;
          // 이전 대화는 완료된 메시지만 보낸다 (실패·처리 중 메시지 제외). 최근 50개를 가져와 오래된 순으로 되돌린다
          const historyRows = (await messages.find({ where: { conversationId: conversation.conversationId, status: 'COMPLETED' }, order: { sequenceNo: 'DESC' }, take: aiRequestDto.MAX_HISTORY })).reverse();
          aiRequest = aiRequestDto.build({ requestId, conversation, userId, input, historyRows });
          userMessage = await messages.save(messages.create({ conversationId: conversation.conversationId, sequenceNo, role: 'USER', content: input.question, clientMessageId, requestId, status: 'PENDING', contextStageId: input.context?.stageId || null, contextConceptId: input.context?.conceptId || null }));
          assistantMessage = await messages.save(messages.create({ conversationId: conversation.conversationId, parentMessageId: userMessage.messageId, sequenceNo: sequenceNo + 1, role: 'ASSISTANT', content: '', requestId, status: 'PENDING' }));
        });
      } catch (error) {
        if (CONCURRENT_CONSTRAINTS.has(uniqueViolation(error))) throw AppError.conflict('같은 대화방에서 답변을 만드는 중입니다. 잠시 후 다시 시도해 주세요.');
        throw error;
      }

      // (2) AI 호출은 트랜잭션 밖에서
      try {
        const answer = aiResponseDto.parse(await aiClient.answer(aiRequest), requestId);
        const completedAt = new Date();
        // (3) 한 트랜잭션: 답변·근거·요청 기록·대화방 시각 저장
        await dataSource.transaction(async (manager) => {
          const messages = repoFor(AiMessage, manager);
          const answerPatch = { content: answer.answer, rewrittenQuery: answer.rewrittenQuery || null, historyFromSeq: answer.historyFromSeq || null, groundingStatus: answer.groundingStatus || null, status: 'COMPLETED', completedAt };
          await messages.update({ messageId: assistantMessage.messageId }, answerPatch);
          Object.assign(assistantMessage, answerPatch);
          const sourceRepo = repoFor(AiMessageSource, manager);
          for (const source of answer.sources) {
            await sourceRepo.save(sourceRepo.create({ messageId: assistantMessage.messageId, documentId: source.documentId, documentVersion: source.documentVersion, chunkId: source.chunkId, titleSnapshot: source.titleSnapshot, conceptCode: source.conceptCode, rank: source.rank, relevanceScore: source.relevanceScore == null ? null : String(source.relevanceScore) }));
          }
          await messages.update({ messageId: userMessage.messageId }, { status: 'COMPLETED', completedAt });
          Object.assign(userMessage, { status: 'COMPLETED', completedAt });
          const { usage } = answer;
          await repoFor(AiRequest, manager).update({ requestId }, { status: 'SUCCEEDED', modelId: usage.modelId, embeddingModelId: usage.embeddingModelId, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, latencyMs: usage.latencyMs, cacheHit: usage.cacheHit, retrievalStrategy: usage.retrievalStrategy, estimatedCost: usage.estimatedCost == null ? null : String(usage.estimatedCost), currency: usage.currency, completedAt });
          await repoFor(AiConversation, manager).update({ conversationId: conversation.conversationId }, { updatedAt: completedAt });
        });
        return messageDto.sendResult({ userMessage, assistantMessage, assistantSources: answer.sources, reserved: quotaResult, dailyLimit: env.aiDailyLimit });
      } catch (error) {
        // (4) 실패: 두 메시지 FAILED, 요청 기록 FAILED (실패 요청은 일일 한도에서 빠진다)
        const errorCode = error.code || 'AI_UNAVAILABLE';
        await dataSource.transaction(async (manager) => {
          await repoFor(AiMessage, manager).update({ messageId: In([userMessage.messageId, assistantMessage.messageId]) }, { status: 'FAILED', errorCode });
          await repoFor(AiRequest, manager).update({ requestId }, { status: 'FAILED', errorCode, completedAt: new Date() });
        }).catch(() => {});
        throw error;
      }
    },
    usage: async (userId) => messageDto.usage(await quota.usage(userId)),
  };
}

module.exports = tutorService;
module.exports.tutorKey = tutorKey;
