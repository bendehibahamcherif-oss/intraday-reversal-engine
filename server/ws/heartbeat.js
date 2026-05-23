export function startHeartbeat(wss) {
  setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) {
        console.log('Terminating stale websocket');
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
  }, 10000);
}

export function attachHeartbeat(ws) {
  ws.isAlive = true;

  ws.on('message', (raw) => {
    try {
      const data = JSON.parse(raw.toString());

      if (data.type === 'pong') {
        ws.isAlive = true;
      }
    } catch (err) {
      console.error(err);
    }
  });
}
