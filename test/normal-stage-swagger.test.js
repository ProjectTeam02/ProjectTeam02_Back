const assert = require('node:assert/strict');
const test = require('node:test');
const swaggerJsdoc = require('swagger-jsdoc');
const config = require('../src/config/swagger.config');

test('normal Stage Swagger matches authenticated routes and hides pre-answer solution', () => {
  const spec = swaggerJsdoc(config);
  for (const [path, method] of [
    ['/api/v1/stages/{stageId}/attempts', 'post'],
    ['/api/v1/attempts/{attemptId}/current-question', 'get'],
    ['/api/v1/attempts/{attemptId}/answers', 'post'],
    ['/api/v1/attempts/{attemptId}', 'get'],
    ['/api/v1/quizzes/stages/{stageId}/attempts', 'post'],
    ['/api/v1/quizzes/attempts/{attemptId}', 'get'],
    ['/api/v1/quizzes/attempts/{attemptId}/result', 'get'],
    ['/api/v1/quizzes/{id}/submit', 'post'],
  ]) {
    const operation = spec.paths[path][method];
    assert.deepEqual(operation.security, [{ bearerAuth: [] }]);
    assert.ok(operation.responses[401]);
  }
  const current = spec.components.schemas.NormalStageQuestion;
  assert.equal('isCorrect' in current.properties.choices.items.properties, false);
  assert.equal('explanation' in current.properties, false);
  const generate = spec.paths['/api/v1/quizzes/generate'].get;
  const legacyResponse = generate.responses[200].content['application/json'];
  assert.equal(legacyResponse.schema.properties.data.$ref, '#/components/schemas/Quiz');
  assert.equal(legacyResponse.example.data.explanation, null);
  assert.equal(spec.components.schemas.Quiz.properties.explanation.nullable, true);
  const submit = spec.paths['/api/v1/quizzes/{id}/submit'].post;
  assert.deepEqual(submit.requestBody.content['application/json'].schema.required, ['choiceId', 'attemptId']);
  assert.equal(submit.responses[201].content['application/json'].example.data.status, 'PASSED');
  assert.equal(spec.paths['/api/v1/quizzes/stages/{stageId}/attempts'].post.responses[201]
    .content['application/json'].examples.started.value.data.resumed, false);
  assert.deepEqual(spec.paths['/api/v1/stages/{stageId}/attempts'].post.requestBody
    .content['application/json'].schema.required, ['mode']);
  assert.equal(spec.paths['/api/v1/attempts/{attemptId}/answers'].post.requestBody
    .content['application/json'].schema.$ref, '#/components/schemas/NormalStageAnswerRequest');
  assert.equal(spec.components.schemas.NormalStageAttemptDetails.properties.passed.type, 'boolean');
});
