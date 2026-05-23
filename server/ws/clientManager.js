class ClientManager {
  constructor() {
    this.clients = new Map();
  }

  addClient(id, socket) {
    this.clients.set(id, {
      socket,
      subscriptions: new Set(),
      connectedAt: Date.now(),
      lastHeartbeat: Date.now(),
    });
  }

  removeClient(id) {
    this.clients.delete(id);
  }

  subscribe(id, channel) {
    const client = this.clients.get(id);

    if (!client) {
      return;
    }

    client.subscriptions.add(channel);
  }

  heartbeat(id) {
    const client = this.clients.get(id);

    if (!client) {
      return;
    }

    client.lastHeartbeat = Date.now();
  }

  getStaleClients(timeout = 15000) {
    return [...this.clients.entries()]
      .filter(([, client]) => {
        return Date.now() - client.lastHeartbeat > timeout;
      })
      .map(([id]) => id);
  }

  broadcast(channel, payload) {
    this.clients.forEach((client) => {
      if (client.subscriptions.has(channel)) {
        try {
          client.socket.send(
            JSON.stringify(payload)
          );
        } catch (err) {
          console.error(err);
        }
      }
    });
  }

  stats() {
    return {
      connectedClients: this.clients.size,
      subscriptions: [...this.clients.values()].reduce(
        (acc, c) => acc + c.subscriptions.size,
        0
      ),
    };
  }
}

module.exports = new ClientManager();
