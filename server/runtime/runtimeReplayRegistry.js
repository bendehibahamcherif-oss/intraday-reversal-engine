class RuntimeReplayRegistry {
  constructor() {
    this.replays = new Map();
  }

  register(replayId, replay = {}) {
    this.replays.set(replayId, {
      replayId,
      replay,
      updatedAt: Date.now(),
    });
  }

  get(replayId) {
    return this.replays.get(replayId);
  }

  list() {
    return [...this.replays.values()];
  }
}

module.exports = new RuntimeReplayRegistry();
