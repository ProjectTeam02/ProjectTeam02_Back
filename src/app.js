const express = require('express');

const app = express();

app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ success: true, message: 'Leren BackEnd is running.' });
});

module.exports = app;
