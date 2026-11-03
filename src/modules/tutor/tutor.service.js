/**
 * AI Tutor 비즈니스 로직
 * 백엔드 작업: 유스케이스 흐름과 기존 정책을 유지
 * 주의: DB는 Repository, 외부 통신은 Client를 사용한다.
 */
const crypto = require('node:crypto');
const { AiConversation, AiMessage, AiMessageSource, AiRequest } = require('@leren/database');
const { AppDataSource } = require('../../config/database');
const AppError = require('../../common/errors/AppError');
const FastApiClient = require('../../clients/fastapi.client');
const quotaService = require('./quota.service');

function tutorService(dataSource = AppDataSource, aiClient = new FastApiClient()) {
  const quota = quotaService(dataSource);
  const repoFor = (entity, manager = dataSource.manager) => manager.getRepository(entity);

  async function ownedConversation(userId, conversationId, manager = dataSource.manager) {
    const conversation = await repoFor(AiConversation, manager).findOneBy({ conversationId, userId });
    if (!conversation) throw AppError.notFound('대화방을 찾을 수 없습니다.');
    return conversation;
  }

  async function withSources(messages, manager) {
    if (!messages.length) return messages;
    const sources = await repoFor(AiMessageSource, manager).findBy({ messageId: require('typeorm').In(messages.map((item) => item.messageId)) });
    const byMessage = new Map();
    for (const source of sources) byMessage.set(source.messageId, [...(byMessage.get(source.messageId) || []), source]);
    return messages.map((message) => ({ ...message, sources: byMessage.get(message.messageId) || [] }));
  }

  return {
    async createConversation(userId, input) {
      const repo = repoFor(AiConversation);
      const conversation = repo.create({ userId, entryPoint: input.entryPoint || null, contextTopicId: input.contextTopicId || null, contextStageId: input.contextStageId || null, contextConceptId: input.contextConceptId || null });
      return repo.save(conversation);
    },
    async listConversations(userId, { skip, take }) {
      const repo = repoFor(AiConversation);
      const [items, total] = await repo.findAndCount({ where: { userId }, order: { updatedAt: 'DESC' }, skip, take });
      return { items, total };
    },
    async messages(userId, conversationId, { skip, take }) {
      await ownedConversation(userId, conversationId);
      const repo = repoFor(AiMessage);
      const [items, total] = await repo.findAndCount({ where: { conversationId }, order: { sequenceNo: 'ASC' }, skip, take });
      return { items: await withSources(items, dataSource.manager), total };
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
          if (assistant) return { userMessage: previous, assistantMessage: (await withSources([assistant], dataSource.manager))[0], usage: null, duplicate: true };
          throw AppError.conflict('동일한 요청이 이미 처리 중입니다.');
        }
      }

      const requestId = crypto.randomUUID();
      const quotaResult = await quota.reserve(userId, { requestId, userId, conversationId: conversation.conversationId, requestType: 'TUTOR', status: 'RESERVED', modelTier: input.modelTier, idempotencyKey: clientMessageId });
      const historyRows = await messageRepo.find({ where: { conversationId: conversation.conversationId }, order: { sequenceNo: 'ASC' }, take: 50 });
      const sequenceNo = historyRows.length ? historyRows[historyRows.length - 1].sequenceNo + 1 : 1;
      const aiRequest = { requestId, conversationId: conversation.conversationId, userId, question: input.question, modelTier: input.modelTier, history: historyRows.map((item) => ({ sequenceNo: item.sequenceNo, role: item.role, content: item.content })), summary: conversation.summary, summaryUntilSeq: conversation.summaryUntilSeq, context: input.context, knowledgeScope: input.knowledgeScope };
      let userMessage;
      try {
        userMessage = await messageRepo.save(messageRepo.create({ conversationId: conversation.conversationId, sequenceNo, role: 'USER', content: input.question, clientMessageId, requestId, status: 'PENDING', contextStageId: input.context?.stageId || null, contextConceptId: input.context?.conceptId || null }));
        const answer = await aiClient.answer(aiRequest);
        const assistantRepo = repoFor(AiMessage);
        const assistantMessage = await assistantRepo.save(assistantRepo.create({ conversationId: conversation.conversationId, parentMessageId: userMessage.messageId, sequenceNo: sequenceNo + 1, role: 'ASSISTANT', content: answer.answer, rewrittenQuery: answer.rewrittenQuery || null, historyFromSeq: answer.historyFromSeq || null, groundingStatus: answer.groundingStatus || null, requestId, status: 'COMPLETED', completedAt: new Date() }));
        const sourceRepo = repoFor(AiMessageSource);
        for (const [index, source] of (answer.sources || []).entries()) {
          await sourceRepo.save(sourceRepo.create({ messageId: assistantMessage.messageId, documentId: source.documentId, documentVersion: source.documentVersion || null, chunkId: source.chunkId, titleSnapshot: source.titleSnapshot || null, conceptCode: source.conceptCode || null, rank: source.rank || index + 1, relevanceScore: source.relevanceScore == null ? null : String(source.relevanceScore) }));
        }
        userMessage.status = 'COMPLETED'; userMessage.completedAt = new Date(); await messageRepo.save(userMessage);
        await repoFor(AiRequest).update({ requestId }, { status: 'SUCCEEDED', modelId: answer.usage?.modelId || null, embeddingModelId: answer.usage?.embeddingModelId || null, inputTokens: answer.usage?.inputTokens ?? null, outputTokens: answer.usage?.outputTokens ?? null, latencyMs: answer.usage?.latencyMs ?? null, cacheHit: answer.usage?.cacheHit ?? null, retrievalStrategy: answer.usage?.retrievalStrategy || null, estimatedCost: answer.usage?.estimatedCost == null ? null : String(answer.usage.estimatedCost), currency: answer.usage?.currency || null, completedAt: new Date() });
        await repoFor(AiConversation).update({ conversationId: conversation.conversationId }, { updatedAt: new Date() });
        return { userMessage, assistantMessage: { ...assistantMessage, sources: answer.sources || [] }, usage: answer.usage, quota: quotaResult };
      } catch (error) {
        if (userMessage) await messageRepo.update({ messageId: userMessage.messageId }, { status: 'FAILED', errorCode: error.code || 'AI_UNAVAILABLE' }).catch(() => {});
        await repoFor(AiRequest).update({ requestId }, { status: 'FAILED', errorCode: error.code || 'AI_UNAVAILABLE' }).catch(() => {});
        throw error;
      }
    },
    usage: (userId) => quota.usage(userId),
  };
}

module.exports = tutorService;
