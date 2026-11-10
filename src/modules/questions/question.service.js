/** Generated question draft ingestion: validate, then persist atomically. */
const { AppDataSource } = require('../../config/database');
const schema = require('./question.schema');
const repository = require('./question.repository');

function service(dataSource = AppDataSource) {
  const questions = repository(dataSource);
  return {
    async createGeneratedDraft(payload) {
      const normalized = schema.generatedDraft({ body: payload }).body;
      return questions.saveGeneratedDraft(normalized);
    },
  };
}

module.exports = service;
