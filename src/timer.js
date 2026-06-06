export class Timer {
  constructor(durationSeconds) {
    this.duration = durationSeconds;
    this.remaining = durationSeconds;
    this.running = false;
    this._onTick = null;
    this._onEnd = null;
  }

  onTick(cb) {
    this._onTick = cb;
  }

  onEnd(cb) {
    this._onEnd = cb;
  }

  start() {
    this.running = true;
  }

  pause() {
    this.running = false;
  }

  resume() {
    this.running = true;
  }

  update(delta) {
    if (!this.running || this.remaining <= 0) return;
    this.remaining -= delta;
    if (this.remaining <= 0) {
      this.remaining = 0;
      this.running = false;
      if (this._onEnd) this._onEnd();
    }
  }

  get formatted() {
    const m = Math.floor(this.remaining / 60);
    const s = Math.floor(this.remaining % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
}
