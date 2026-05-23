class RuntimeRegistry {
  constructor() {
    this.services = new Map();
  }

  register(name, service) {
    this.services.set(name, service);
  }

  get(name) {
    return this.services.get(name);
  }

  list() {
    return [...this.services.keys()];
  }
}

module.exports = new RuntimeRegistry();
