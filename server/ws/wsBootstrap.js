const heartbeat = require('./heartbeat');
const clientManager = require('./clientManager');
const broadcastEngine = require('./broadcastEngine');
const recoveryEngine = require('./recoveryEngine');

function bootstrapWebSocket(wss) {
  heartbeat.startHeartbeat(wss);

  wss.on('connection', (ws) => {
    const clientId = `client_${Date.now()}_${Math.random()}`;

    ws.clientId = clientId;

    clientManager.addClient(clientId, ws);

    ws.on('message', (raw) => {
      try {
        const data = JSON.parse(raw.toString());

        if (data.type === 'subscribe') {
          clientManager.subscribe(
            clientId,
            data.channel
          );
        }

        if (data.type === 'pong') {
          clientManager.heartbeat(clientId);
        }

        if (data.sequence) {
          recoveryEngine.updateSequence(
            data.channel || 'global',
            data.sequence
          );
        }
      } catch (err) {
        console.error(err);
      }
    });

    ws.on('close', () => {
      clientManager.removeClient(clientId);
    });

    ws.send(
      JSON.stringify({
        type: 'connected',
        clientId,
        ts: Date.now(),
      })
    );
  });

  console.log('Institutional websocket stack initialized');

  return {
    broadcastEngine,
    clientManager,
    recoveryEngine,
  };
}

module.exports = bootstrapWebSocket;
