module.exports = function authMiddleware(_req, _res, next) {
  // TODO: verify access token and attach the authenticated user.
  next();
};
