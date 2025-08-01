import * as vscode from 'vscode';
import { SessionManager } from './sessionManager';
import { EventBuffer } from './buffer';
import { EventListener } from './eventListener';

export async function activate(ctx: vscode.ExtensionContext) {
  const cfg = vscode.workspace.getConfiguration('devtimetracker');
  const apiUrl = cfg.get<string>('apiUrl')!;
  const apiToken = cfg.get<string>('apiToken')!;

  // Start a new coding session
  const sessionMgr = new SessionManager(apiUrl, apiToken, ctx);
  const sessionId = await sessionMgr.startSession();

  // Buffer + Listener
  const buffer = new EventBuffer(apiUrl, apiToken, sessionId);
  buffer.start();
  ctx.subscriptions.push({ dispose: () => buffer.stop() });

  const listener = new EventListener(ctx, buffer, sessionId);
  listener.start();

  // Command to show current active minutes
  ctx.subscriptions.push(
    vscode.commands.registerCommand('devtimetracker.showStatus', () => {
      vscode.window.showInformationMessage(
        `Active coding time: ${listener.getActiveMinutes()} min`
      );
    })
  );
}

export async function deactivate() {
  await SessionManager.endSession();
}
