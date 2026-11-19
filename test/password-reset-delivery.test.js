const assert = require('node:assert/strict');
const test = require('node:test');
const { create } = require('../src/modules/auth/password-reset.delivery');

const config = {
  NODE_ENV: 'production', PASSWORD_RESET_SMTP_HOST: 'smtp.example.test', PASSWORD_RESET_FROM: 'leren@example.test',
  PASSWORD_RESET_URL: 'https://app.example.test/reset-password?token=old&campaign=mvp',
};

test('SMTP delivery requires TLS and builds the frontend resetToken link', async () => {
  const send = create({ ...config, PASSWORD_RESET_SMTP_USER: 'mock', PASSWORD_RESET_SMTP_PASS: 'mock-only' }, options => {
    assert.equal(options.port, 587);
    assert.equal(options.secure, false);
    assert.equal(options.requireTLS, true);
    assert.deepEqual(options.auth, { user: 'mock', pass: 'mock-only' });
    assert.equal(options.debug, false);
    return { async sendMail(mail) {
      assert.deepEqual(mail.envelope, { from: 'leren@example.test', to: ['learner@example.test'] });
      const link = new URL(mail.text.split('\n').find(line => line.startsWith('https:')));
      assert.equal(link.pathname, '/reset-password');
      assert.equal(link.searchParams.get('resetToken'), 'test-only+code');
      assert.equal(link.searchParams.get('campaign'), 'mvp');
      assert.equal(link.searchParams.has('token'), false);
      return { accepted: mail.envelope.to, rejected: [] };
    } };
  });
  await send({ email: 'learner@example.test', token: 'test-only+code' });
});

test('SMTP failure and recipient rejection are not marked as accepted', async () => {
  const send = create({ ...config, PASSWORD_RESET_SMTP_PORT: '465' }, options => {
    assert.equal(options.secure, true);
    return { sendMail: async () => ({ accepted: [], rejected: ['learner@example.test'] }) };
  });
  await assert.rejects(() => send({ email: 'learner@example.test', token: 'test-only' }), /did not accept/);
});

test('missing settings or an unsafe reset destination disable the adapter', () => {
  const unexpectedTransport = () => assert.fail('invalid settings started a transport');
  for (const options of [{ PASSWORD_RESET_URL: undefined }, { PASSWORD_RESET_SMTP_USER: 'incomplete' }, { PASSWORD_RESET_SMTP_PORT: 'not-a-port' },
    { PASSWORD_RESET_URL: 'leren://auth/callback' }, { PASSWORD_RESET_URL: 'http://127.0.0.1/reset-password' },
    { PASSWORD_RESET_URL: 'https://app.example.test/reset-password#bad' }]) {
    assert.equal(create({ ...config, ...options }, unexpectedTransport), null);
  }
  assert.equal(typeof create({ ...config, NODE_ENV: 'test', PASSWORD_RESET_URL: 'http://127.0.0.1:3000/reset-password' }, () => ({})), 'function');
});
