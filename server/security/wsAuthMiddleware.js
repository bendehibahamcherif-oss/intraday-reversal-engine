function wsAuthMiddleware(ws, req, next) {
  try {
    const token = req.headers['x-auth-token'];

    if (!token) {
      ws.close();
      return;
    }

    ws.authenticated = true;

    next();
  } catch (err) {
    console.error(err);
    ws.close();
  }
}

module.exports = wsAuthMiddleware;
