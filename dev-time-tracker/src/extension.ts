import * as vscode from 'vscode';
import { SessionManager } from './sessionManager';
import { EventBuffer } from './buffer';
import { EventListener } from './eventListener';
import { StatusBarManager } from './statusBarManager';

// Track user activity state
let lastActivityTime = Date.now();
const INACTIVITY_THRESHOLD = 300000; // 5 minutes in milliseconds

// Update activity status based on user interaction
function updateActivityStatus(statusBarManager: StatusBarManager) {
  const now = Date.now();
  const isActive = now - lastActivityTime < INACTIVITY_THRESHOLD;
  statusBarManager.updateActivityStatus(isActive);
}

export async function activate(ctx: vscode.ExtensionContext) {
  const cfg = vscode.workspace.getConfiguration('devtimetracker');
  const apiUrl = cfg.get<string>('apiUrl')!;
  const apiToken = cfg.get<string>('apiToken')!;

  // Initialize status bar manager
  const statusBarManager = StatusBarManager.getInstance();
  
  // Start a new coding session
  const sessionMgr = new SessionManager(apiUrl, apiToken, ctx);
  const sessionId = await sessionMgr.startSession();

  // Buffer + Listener
  const buffer = new EventBuffer(apiUrl, apiToken, sessionId);
  buffer.start();
  ctx.subscriptions.push({ dispose: () => buffer.stop() });

  const listener = new EventListener(ctx, buffer, sessionId);
  listener.start();

  // Track user activity
  const updateLastActivity = () => {
    lastActivityTime = Date.now();
    updateActivityStatus(statusBarManager);
  };

  // Set up event listeners for user activity
  const activityEvents: vscode.Disposable[] = [
    vscode.window.onDidChangeActiveTextEditor(updateLastActivity),
    vscode.window.onDidChangeTextEditorSelection(updateLastActivity),
    vscode.window.onDidChangeTextEditorVisibleRanges(updateLastActivity),
    vscode.workspace.onDidChangeTextDocument(updateLastActivity)
  ];
  
  // Add activity event listeners to subscriptions
  activityEvents.forEach(disposable => ctx.subscriptions.push(disposable));

  // Update activity status periodically
  const activityCheckInterval = setInterval(
    () => updateActivityStatus(statusBarManager),
    60000 // Check every minute
  );
  ctx.subscriptions.push({ dispose: () => clearInterval(activityCheckInterval) });

  // Register commands
  ctx.subscriptions.push(
    vscode.commands.registerCommand('devtimetracker.showStatus', () => {
      vscode.window.showInformationMessage(
        `Active coding time: ${listener.getActiveMinutes()} min`
      );
    }),
    vscode.commands.registerCommand('devtimetracker.togglePomodoro', () => {
      statusBarManager.togglePomodoro();
    })
  );

  // Initial update of activity status
  updateActivityStatus(statusBarManager);
}

export async function deactivate() {
  await SessionManager.endSession();
}
