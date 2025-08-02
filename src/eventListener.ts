import * as vscode from 'vscode';
import { EventBuffer, RawEvent } from './buffer';

export class EventListener {
  private lastTime = Date.now();
  private totalMs = 0;

  constructor(
    private ctx: vscode.ExtensionContext,
    private buffer: EventBuffer,
    private sessionId: string
  ) {}

  start() {
    const record = (type: 'typing' | 'mousemove') => {
      const now = Date.now();
      const delta = now - this.lastTime;
      if (delta < 5 * 60_000) this.totalMs += delta;
      this.lastTime = now;

      const evt: RawEvent = { sessionId: this.sessionId, eventType: type, timestamp: now };
      this.buffer.add(evt);
      this.ctx.globalState.update('activeMs', this.totalMs);
    };

    vscode.window.onDidChangeTextEditorSelection(() => record('typing'), this);
    vscode.workspace.onDidChangeTextDocument(() => record('typing'), this);
    vscode.window.onDidChangeTextEditorSelection(() => record('mousemove'), this);
  }

  getActiveMinutes() {
    return Math.floor(this.totalMs / 60_000);
  }
}
