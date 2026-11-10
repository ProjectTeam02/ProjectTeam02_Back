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
          const assistant = await messageRepo.findOneBy({ conversationId: conversation.conversationId, sequenceNo: previous.sequenceNo + 1, role: 'ASSISTANT' });
          if (assistant) {
            const sources = await sourcesFor([assistant], dataSource.manager);
            return messageDto.sendResult({ userMessage: previous, assistantMessage: assistant, assistantSources: sources.get(assistant.messageId) || [], duplicate: true });
          }
          throw AppError.conflict('동일한 요청이 이미 처리 중입니다.');
        }
      }

      const requestId = crypto.randomUUID();
      const quotaResult = await quota.reserve(userId, { requestId, userId, conversationId: conversation.conversationId, requestType: 'TUTOR', status: 'RESERVED', modelTier: input.modelTier, idempotencyKey: clientMessageId });
      // 최근 50개를 가져와 오래된 순으로 되돌린다. (오름차순 take 50이면 51번째 메시지부터 sequenceNo가 중복된다)
      const historyRows = (await messageRepo.find({ where: { conversationId: conversation.conversationId }, order: { sequenceNo: 'DESC' }, take: aiRequestDto.MAX_HISTORY })).reverse();
      const sequenceNo = historyRows.length ? historyRows[historyRows.length - 1].sequenceNo + 1 : 1;
      const aiRequest = aiRequestDto.build({ requestId, conversation, userId, input, historyRows });
      let userMessage;
      try {
        userMessage = await messageRepo.save(messageRepo.create({ conversationId: conversation.conversationId, sequenceNo, role: 'USER', content: input.question, clientMessageId, requestId, status: 'PENDING', contextStageId: input.context?.stageId || null, contextConceptId: input.context?.conceptId || null }));
        const answer = aiResponseDto.parse(await aiClient.answer(aiRequest), requestId);
        const assistantRepo = repoFor(AiMessage);
        const assistantMessage = await assistantRepo.save(assistantRepo.create({ conversationId: conversation.conversationId, parentMessageId: userMessage.messageId, sequenceNo: sequenceNo + 1, role: 'ASSISTANT', content: answer.answer, rewrittenQuery: answer.rewrittenQuery || null, historyFromSeq: answer.historyFromSeq || null, groundingStatus: answer.groundingStatus || null, requestId, status: 'COMPLETED', completedAt: new Date() }));
        const sourceRepo = repoFor(AiMessageSource);
        for (const source of answer.sources) {
          await sourceRepo.save(sourceRepo.create({ messageId: assistantMessage.messageId, documentId: source.documentId, documentVersion: source.documentVersion, chunkId: source.chunkId, titleSnapshot: source.titleSnapshot, conceptCode: source.conceptCode, rank: source.rank, relevanceScore: source.relevanceScore == null ? null : String(source.relevanceScore) }));
        }
        userMessage.status = 'COMPLETED'; userMessage.completedAt = new Date(); await messageRepo.save(userMessage);
        const { usage } = answer;
        await repoFor(AiRequest).update({ requestId }, { status: 'SUCCEEDED', modelId: usage.modelId, embeddingModelId: usage.embeddingModelId, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, latencyMs: usage.latencyMs, cacheHit: usage.cacheHit, retrievalStrategy: usage.retrievalStrategy, estimatedCost: usage.estimatedCost == null ? null : String(usage.estimatedCost), currency: usage.currency, completedAt: new Date() });
        await repoFor(AiConversation).update({ conversationId: conversation.conversationId }, { updatedAt: new Date() });
        return messageDto.sendResult({ userMessage, assistantMessage, assistantSources: answer.sources, reserved: quotaResult, dailyLimit: env.aiDailyLimit });
      } catch (error) {
        if (userMessage) await messageRepo.update({ messageId: userMessage.messageId }, { status: 'FAILED', errorCode: error.code || 'AI_UNAVAILABLE' }).catch(() => {});
        await repoFor(AiRequest).update({ requestId }, { status: 'FAILED', errorCode: error.code || 'AI_UNAVAILABLE' }).catch(() => {});
        throw error;
      }
    },
    usage: async (userId) => messageDto.usage(await quota.usage(userId)),
  };
}

module.exports = tutorService;
