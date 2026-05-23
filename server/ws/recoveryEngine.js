class RecoveryEngine {
  constructor() {
    this.snapshots = new Map();
    this.sequences = new Map();
  }

  updateSequence(channel, sequence) {
    this.sequences.set(channel, sequence);
  }

  getSequence(channel) {
    return this.sequences.get(channel) || 0;
  }

  detectGap(channel, incomingSequence) {
    const last = this.getSequence(channel);

    if (incomingSequence > last + 1) {
      return {
        gap: true,
        expected: last + 1,
        received: incomingSequence,
      };
    }

    this.updateSequence(channel, incomingSequence);

    return {
      gap: false,
    };
  }

  saveSnapshot(channel, snapshot) {
    this.snapshots.set(channel, {
      snapshot,
      ts: Date.now(),
    });
  }

  getSnapshot(channel) {
    return this.snapshots.get(channel);
  }

  recover(channel) {
    return {
      sequence: this.getSequence(channel),
      snapshot: this.getSnapshot(channel),
      recoveredAt: Date.now(),
    };
  }
}

module.exports = new RecoveryEngine();
