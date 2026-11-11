/**
 * WebSocket client for the live rig feed. Reconnects with back-off, accepts
 * text or binary JSON frames and hands every frame to the validator.
 */
export class TelemetryClient {
  constructor(validator) {
    this.validator = validator;
    this.url = '';
    this.ws = null;
    this.state = 'disconnected';     // disconnected | connecting | open | retrying
    this.wanted = false;
    this.retryMs = 1000;
    this.retryTimer = null;
    this.frames = 0;
    this.rate = 0;                   // frames per second (smoothed)
    this.window = { t: 0, n: 0 };
    this.lastError = '';
    this.onChange = () => {};
    this.decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder() : null;
  }

  connect(url) {
    this.disconnect();
    this.url = url;
    this.wanted = true;
    this.retryMs = 1000;
    this.open();
  }

  open() {
    if (!this.wanted) return;
    this.setState('connecting');
    let ws;
    try {
      ws = new WebSocket(this.url);
    } catch (err) {
      this.lastError = `Bad address: ${err.message}`;
      this.wanted = false;
      this.setState('disconnected');
      return;
    }
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.retryMs = 1000;
      this.lastError = '';
      this.setState('open');
    };
    ws.onmessage = (ev) => {
      if (this.ws !== ws) return;
      const now = performance.now();
      const text = typeof ev.data === 'string' ? ev.data : this.decoder ? this.decoder.decode(ev.data) : '';
      this.frames++;
      this.window.n++;
      if (now - this.window.t > 1000) {
        this.rate = (this.window.n * 1000) / (now - this.window.t);
        this.window = { t: now, n: 0 };
      }
      this.validator.ingest(text, now);
    };
    ws.onerror = () => {
      if (this.ws === ws) this.lastError = 'Connection error';
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.rate = 0;
      if (!this.wanted) return this.setState('disconnected');
      this.setState('retrying');
      this.retryTimer = setTimeout(() => this.open(), this.retryMs);
      this.retryMs = Math.min(10000, this.retryMs * 1.7);
    };
  }

  disconnect() {
    this.wanted = false;
    clearTimeout(this.retryTimer);
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      try { ws.close(); } catch { /* already closed */ }
    }
    this.rate = 0;
    this.setState('disconnected');
  }

  setState(state) {
    this.state = state;
    this.onChange(state);
  }
}
