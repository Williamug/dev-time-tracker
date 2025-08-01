import * as vscode from 'vscode';

export class SessionManager {
  private static apiUrl: string;
  private static apiToken: string;
  private static sessionId?: string;
  private static ctx: vscode.ExtensionContext;

  constructor(apiUrl: string, apiToken: string, ctx: vscode.ExtensionContext) {
    SessionManager.apiUrl = apiUrl.replace(/\/+$/, '');
    SessionManager.apiToken = apiToken;
    SessionManager.ctx = ctx;
  }

  async startSession(): Promise<string> {
    const res = await fetch(`${SessionManager.apiUrl}/api/sessions/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SessionManager.apiToken}`
      }
    });
    const { session_id } = await res.json();
    SessionManager.sessionId = session_id;
    SessionManager.ctx.globalState.update('sessionId', session_id);
    return session_id;
  }

  static async endSession(): Promise<void> {
    if (!SessionManager.sessionId) return;
    await fetch(`${SessionManager.apiUrl}/api/sessions/end`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SessionManager.apiToken}`
      },
      body: JSON.stringify({ session_id: SessionManager.sessionId })
    });
  }
}
