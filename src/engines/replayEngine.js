export class ReplayEngine {
  constructor(data = []) {
    this.data = data;
    this.index = 0;
    this.running = false;
  }

  load(data) {
    this.data = data;
    this.index = 0;
  }

  next() {
    if (this.index >= this.data.length) {
      return null;
    }

    return this.data[this.index++];
  }

  reset() {
    this.index = 0;
  }
}
