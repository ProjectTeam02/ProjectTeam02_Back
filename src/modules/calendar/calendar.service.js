/**
 * 달력 비즈니스 로직 파일
 * 백엔드 작업: 유스케이스 흐름과 정책을 조합
 * 주의: DB 접근은 Repository, 외부 통신은 Client 사용
 */
const { Topic, Stage, Concept, StageConcept } = require('@leren/database');
const { AppDataSource } = require('../../config/database');
const AppError = require('../../common/errors/AppError');
const request = require('./dto/scheduleRequest.dto');
const response = require('./dto/scheduleResponse.dto');
const repository = require('./schedule.repository');

async function resolveTopic(manager, values) {
  const find = (entity, where) => manager.getRepository(entity).findOne({ where, lock: { mode: 'pessimistic_read' } });
  const stage = values.stageId ? await find(Stage, { stageId: values.stageId }) : null;
  const concept = values.conceptId ? await find(Concept, { conceptId: values.conceptId }) : null;
  if (values.stageId && !stage) throw AppError.validation('존재하지 않는 Stage입니다.');
  if (values.conceptId && !concept) throw AppError.validation('존재하지 않는 Concept입니다.');
  const topicId = values.topicId || stage?.topicId || concept?.topicId;
  const topic = topicId ? await find(Topic, { topicId }) : null;
  if (!topic) throw AppError.validation('존재하지 않는 학습 주제입니다.');
  if (!stage && !concept) {
    throw AppError.validation('현재 DB는 Topic 단독 일정을 저장할 수 없습니다. Stage 또는 Concept 선택이나 DB 보완이 필요합니다.', {
      reason: 'TOPIC_ONLY_NOT_SUPPORTED',
    });
  }
  if ((stage && stage.topicId !== topic.topicId) || (concept && concept.topicId !== topic.topicId)) {
    throw AppError.validation('선택한 Stage·Concept과 학습 주제가 일치하지 않습니다.');
  }
  if (stage && concept && !await find(StageConcept, { stageId: stage.stageId, conceptId: concept.conceptId })) {
    throw AppError.validation('선택한 Concept이 Stage에 연결되어 있지 않습니다.');
  }
  return topic;
}

module.exports = function service(dataSource = AppDataSource) {
  return {
    ...require('./calendar-read.service')(dataSource),
    async create(userId, input) {
      const values = request.parse(input);
      return dataSource.transaction(async manager => {
        const topic = await resolveTopic(manager, values);
        const plan = await repository(manager).create({
          userId, scheduledDate: values.scheduledDate, title: values.goal, planType: values.planType,
          stageId: values.stageId ?? null, conceptId: values.conceptId ?? null,
          status: 'PLANNED', completedAt: null, deletedAt: null,
        });
        return response(plan, topic);
      });
    },
    async update(userId, planId, input) {
      request.uuid(planId, 'planId');
      const values = request.parse(input, true);
      return dataSource.transaction(async manager => {
        const schedules = repository(manager);
        const plan = await schedules.findActive(userId, planId, true);
        if (!plan) throw AppError.notFound('일정을 찾을 수 없습니다.');
        const merged = {
          stageId: plan.stageId, conceptId: plan.conceptId, ...values,
        };
        const topic = await resolveTopic(manager, merged);
        const updates = {};
        for (const key of ['scheduledDate', 'planType', 'stageId', 'conceptId']) {
          if (Object.prototype.hasOwnProperty.call(values, key)) updates[key] = values[key];
        }
        if (Object.prototype.hasOwnProperty.call(values, 'goal')) updates.title = values.goal;
        // topicId asserts the selected target's topic; it is not silently written to a nonexistent column.
        if (Object.keys(updates).length) await schedules.updateActive(userId, planId, updates);
        const updated = await schedules.findActive(userId, planId);
        return response(updated, topic);
      });
    },
    async remove(userId, planId) {
      request.uuid(planId, 'planId');
      return dataSource.transaction(async manager => {
        const schedules = repository(manager);
        const plan = await schedules.findActive(userId, planId, true);
        if (!plan) throw AppError.notFound('일정을 찾을 수 없습니다.');
        const deletedAt = new Date();
        await schedules.updateActive(userId, planId, { deletedAt });
        return { planId: plan.planId, deleted: true, deletedAt };
      });
    },
  };
};
