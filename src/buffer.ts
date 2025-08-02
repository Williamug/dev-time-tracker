import * as vscode from 'vscode';

export interface RawEvent {
  sessionId: string;
  eventType: 'typing' | 'mousemove';
  timestamp: number;
}

export class EventBuffer {
  private buffer: RawEvent[] = [];
  private timer?: NodeJS.Timeout;
  private readonly intervalMs = 30_000;   // flush every 30s
  private readonly batchSize = 20;

  constructor(
    private apiUrl: string,
    private apiToken: string,
    private sessionId: string
  ) {
    this.apiUrl = apiUrl.replace(/\/+$/, '');
  }

  start() {
    this.timer = setInterval(() => this.flush(), this.intervalMs);
    vscode.workspace.onDidCloseTextDocument(() => this.flush());
  }

  add(evt: RawEvent) {
    this.buffer.push(evt);
    if (this.buffer.length >= this.batchSize) {
      this.flush();
    }
  }

  private async flush() {
    if (!this.buffer.length) return;
    const batch = this.buffer.splice(0);
    try {
      const res = await fetch(`${this.apiUrl}/api/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiToken}`
        },
        body: JSON.stringify(batch)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      console.log(`Flushed ${batch.length} events`);
    } catch (err) {
      console.error('Flush failed, re-queuing:', err);
      this.buffer.unshift(...batch);
    }
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.flush();
  }
}
