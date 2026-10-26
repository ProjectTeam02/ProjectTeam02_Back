const crypto = require('node:crypto');
const prismaDefault = require('../../config/prisma');
const AppError = require('../../common/errors/AppError');
const FastApiClient = require('../../clients/fastapi.client');
const quotaService = require('./quota.service');

function service(db = prismaDefault, aiClient = new FastApiClient()) {
  const quota = quotaService(db);
  async function ownedConversation(userId, id) {
    const conversation = await db.aiConversation.findFirst({ where: { id, userId } });
    if (!conversation) throw AppError.notFound('대화방을 찾을 수 없습니다.');
    return conversation;
  }
  return {
    async createConversation(userId, input) {
      return db.aiConversation.create({ data: { userId, ...input } });
    },
    async listConversations(userId, { skip, take }) {
      const [items, total] = await Promise.all([
        db.aiConversation.findMany({ where: { userId }, orderBy: { updatedAt: 'desc' }, skip, take }),
        db.aiConversation.count({ where: { userId } }),
      ]);
      return { items, total };
    },
    async messages(userId, conversationId, { skip, take }) {
      await ownedConversation(userId, conversationId);
      const [items, total] = await Promise.all([
        db.aiMessage.findMany({ where: { conversationId }, orderBy: { sequenceNo: 'asc' }, skip, take, include: { sources: true } }),
        db.aiMessage.count({ where: { conversationId } }),
      ]);
      return { items, total };
    },
    async sendMessage(userId, input, idempotencyKey) {
      const conversation = await ownedConversation(userId, input.conversationId);
      const clientMessageId = input.clientMessageId || idempotencyKey || null;
      if (clientMessageId) {
        const previous = await db.aiMessage.findFirst({ where: { conversationId: conversation.id, clientMessageId }, include: { sources: true } });
        if (previous) {
          if (previous.content !== input.question) {
            throw AppError.conflict('Idempotency-Key가 다른 질문에 이미 사용되었습니다.');
          }
          if (previous.role === 'ASSISTANT') return { userMessage: null, assistantMessage: previous, usage: null, duplicate: true };
          const assistant = await db.aiMessage.findFirst({ where: { conversationId: conversation.id, sequenceNo: previous.sequenceNo + 1 }, include: { sources: true } });
          if (assistant) return { userMessage: previous, assistantMessage: assistant, usage: null, duplicate: true };
          throw AppError.conflict('동일한 요청이 이미 처리 중입니다.');
        }
      }
      const requestId = crypto.randomUUID();
      const quotaResult = await quota.reserve(userId, {
        requestId,
        userId,
        conversationId: conversation.id,
        requestType: 'TUTOR',
        status: 'RESERVED',
        modelTier: input.modelTier,
      });
      const messages = await db.aiMessage.findMany({ where: { conversationId: conversation.id }, orderBy: { sequenceNo: 'asc' }, take: 50 });
      const sequenceNo = messages.length ? messages[messages.length - 1].sequenceNo + 1 : 1;
      const history = messages.map((item) => ({ sequenceNo: item.sequenceNo, role: item.role, content: item.content }));
      const aiRequest = {
        requestId, conversationId: conversation.id, userId, question: input.question,
        modelTier: input.modelTier, history, summary: conversation.summary,
        summaryUntilSeq: conversation.summaryUntilSeq, context: input.context,
        knowledgeScope: input.knowledgeScope,
      };
      let userMessage = null;
      try {
        userMessage = await db.aiMessage.create({ data: { conversationId: conversation.id, sequenceNo, role: 'USER', content: input.question, clientMessageId, requestId, status: 'PROCESSING' } });
        const answer = await aiClient.answer(aiRequest);
        const assistantMessage = await db.aiMessage.create({
          data: { conversationId: conversation.id, sequenceNo: sequenceNo + 1, role: 'ASSISTANT', content: answer.answer, rewrittenQuery: answer.rewrittenQuery, groundingStatus: answer.groundingStatus, requestId, status: 'COMPLETED', sources: { create: (answer.sources || []).map((source) => ({ documentId: source.documentId, documentVersion: source.documentVersion, chunkId: source.chunkId, titleSnapshot: source.titleSnapshot, conceptCode: source.conceptCode, rank: source.rank, relevanceScore: source.relevanceScore })) } },
          include: { sources: true },
        });
        await db.aiMessage.update({ where: { id: userMessage.id }, data: { status: 'COMPLETED' } });
        await db.aiRequest.update({ where: { requestId }, data: { status: 'COMPLETED', modelId: answer.usage?.modelId, embeddingModelId: answer.usage?.embeddingModelId, inputTokens: answer.usage?.inputTokens, outputTokens: answer.usage?.outputTokens, latencyMs: answer.usage?.latencyMs, cacheHit: answer.usage?.cacheHit, retrievalStrategy: answer.usage?.retrievalStrategy, estimatedCost: answer.usage?.estimatedCost, currency: answer.usage?.currency } });
        await db.aiConversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });
        return { userMessage, assistantMessage, usage: answer.usage, quota: quotaResult };
      } catch (error) {
        if (userMessage) await db.aiMessage.update({ where: { id: userMessage.id }, data: { status: 'FAILED' } }).catch(() => {});
        await db.aiRequest.update({ where: { requestId }, data: { status: 'FAILED', errorCode: error.code || 'AI_UNAVAILABLE' } }).catch(() => {});
        throw error;
      }
    },
    usage: (userId) => quota.usage(userId),
  };
}

module.exports = service;
