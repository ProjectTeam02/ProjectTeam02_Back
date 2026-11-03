const { randomInt } = require('node:crypto');
// Windows may allocate a browser-blocked low port for listen(0). Request an allowed high port explicitly.
module.exports = async function listenTestServer(app) {
  for (let count = 0; count < 100; count++) {
    const server = app.listen(randomInt(20000, 60000), '127.0.0.1');
    const listening = await new Promise((resolve, reject) => {
      server.once('listening', () => resolve(true));
      server.once('error', error => error.code === 'EADDRINUSE' ? resolve(false) : reject(error));
    });
    if (listening) return server;
  }
  throw new Error('Could not allocate a fetch-compatible test port');
};
