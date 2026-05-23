const clientManager = require('./clientManager');

function startHeartbeat(wss) {
  setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) {
        console.log('Terminating stale websocket');

        if (ws.clientId) {
          clientManager.removeClient(ws.clientId);
        }

        return ws.terminate();
      }

      ws.isAlive = false;

      ws.send(
        JSON.stringify({
          type: 'ping',
          ts: Date.now(),
        })
      );
    });

    const staleClients =
      clientManager.getStaleClients();

    staleClients.forEach((clientId) => {
      console.warn(
        `Removing stale websocket client ${clientId}`
      );

      clientManager.removeClient(clientId);
    });

    const stats = clientManager.stats();

    console.log(
      `WS heartbeat | clients=${stats.connectedClients} subscriptions=${stats.subscriptions}`
    );
  }, 5000);
}

function attachHeartbeat(ws) {
  ws.isAlive = true;

  ws.on('message', (raw) => {
    try {
      const data = JSON.parse(raw.toString());

      if (data.type === 'pong') {
        ws.isAlive = true;

        if (ws.clientId) {
          clientManager.heartbeat(ws.clientId);
        }
      }
    } catch (err) {
      console.error(err);
    }
  });
}

module.exports = {
  startHeartbeat,
  attachHeartbeat,
};
