/** 설정된 SMTP 릴레이에서 재설정 메일을 접수했는지 확인한다. */
const nodemailer = require('nodemailer');

function create(config = process.env, createTransport = nodemailer.createTransport) {
  const host = config.PASSWORD_RESET_SMTP_HOST?.trim();
  const port = Number(config.PASSWORD_RESET_SMTP_PORT || 587);
  const user = config.PASSWORD_RESET_SMTP_USER;
  const pass = config.PASSWORD_RESET_SMTP_PASS;
  const from = config.PASSWORD_RESET_FROM?.trim();
  const target = URL.parse(config.PASSWORD_RESET_URL || '');
  const local = config.NODE_ENV !== 'production' && target?.protocol === 'http:'
    && ['localhost', '127.0.0.1', '[::1]'].includes(target.hostname);
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535 || Boolean(user) !== Boolean(pass)
    || !/^[^\s@,<>]+@[^\s@,<>]+\.[^\s@,<>]+$/.test(from || '') || !target
    || (target.protocol !== 'https:' && !local) || target.username || target.password || target.hash) return null;

  const transport = createTransport({
    host, port, secure: port === 465, requireTLS: port !== 465,
    ...(user ? { auth: { user, pass } } : {}),
    connectionTimeout: 5000, greetingTimeout: 5000, socketTimeout: 8000,
    logger: false, debug: false, disableFileAccess: true, disableUrlAccess: true,
  });

  return async ({ email, token }) => {
    const url = new URL(target);
    url.searchParams.delete('token');
    url.searchParams.set('resetToken', token);
    const result = await transport.sendMail({
      from: { name: 'Leren', address: from }, to: { address: email }, envelope: { from, to: [email] },
      subject: 'Leren 비밀번호 재설정',
      text: `아래 링크에서 30분 안에 새 비밀번호를 설정해 주세요.\n\n${url.href}\n\n요청한 적이 없다면 이 메일을 무시해 주세요.`,
    });
    if (result.accepted?.length !== 1 || result.rejected?.length) throw new Error('SMTP did not accept the recipient');
  };
}

module.exports = { create };
