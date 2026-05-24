class RuntimeDiagnosticsSnapshot {
  create(runtime, metrics) {
    return {
      runtime,
      metrics,
      ts: Date.now(),
    };
  }
}

module.exports = new RuntimeDiagnosticsSnapshot();
