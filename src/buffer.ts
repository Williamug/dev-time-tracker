import * as vscode from 'vscode';
import { DiffService } from './services/DiffService';

export interface CodingActivityEvent {
  event_type: 'typing' | 'click';
  duration: number;
  file_path: string;
  language: string;
  project_name: string;
  editor: string;
  operating_system: string;
  started_at: string;
  ended_at?: string;
  keystrokes?: number;
  lines_added?: number;
  lines_removed?: number;
  metadata?: {
    characters_typed?: number;
    session_id?: string;
    branch?: string;
    diff?: string;
    [key: string]: any;
  };
}

export class EventBuffer {
  private buffer: CodingActivityEvent[] = [];
  private timer?: NodeJS.Timeout;
  private readonly intervalMs = 30_000;   // flush every 30s
  private readonly batchSize = 20;
  private lastEventTime = Date.now();
  private currentFile: string = '';
  private currentLanguage: string = '';
  private projectName: string = '';
  private diffService: DiffService | null = null;

  // Circuit breaker state
  private failureCount = 0;
  private lastFailureTime = 0;
  private circuitState: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  private readonly MAX_FAILURES = 5;
  private readonly CIRCUIT_RESET_TIMEOUT = 60000; // 1 minute

  // Persistent storage
  private context?: vscode.ExtensionContext;

  constructor(
    private apiUrl: string,
    private apiToken: string,
    private sessionId: string,
    diffService?: DiffService | null,
    context?: vscode.ExtensionContext
  ) {
    // Remove trailing slashes from API URL
    this.apiUrl = apiUrl.replace(/\/+$/, '');

    // Update project name dynamically
    this.updateProjectName();

    this.diffService = diffService || null;
    this.context = context;

    // Load any pending activities from storage
    this.loadPendingActivities();
  }

  /**
   * Update project name from current workspace
   */
  private updateProjectName() {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    this.projectName = workspaceFolder?.name || 'Unknown Project';
  }

  /**
   * Load pending activities from persistent storage
   */
  private async loadPendingActivities() {
    if (!this.context) return;

    try {
      const pending = this.context.globalState.get<CodingActivityEvent[]>('pending_activities', []);
      if (pending.length > 0) {
        console.log(`[EventBuffer] Loaded ${pending.length} pending activities from storage`);
        this.buffer.push(...pending);
        // Clear storage after loading
        await this.context.globalState.update('pending_activities', []);
      }
    } catch (error) {
      console.error('[EventBuffer] Failed to load pending activities:', error);
    }
  }

  /**
   * Persist activities to storage
   */
  private async persistToStorage(batch: CodingActivityEvent[]) {
    if (!this.context) return;

    try {
      const existing = this.context.globalState.get<CodingActivityEvent[]>('pending_activities', []);
      await this.context.globalState.update('pending_activities', [...existing, ...batch]);
      console.log(`[EventBuffer] Persisted ${batch.length} activities to storage`);
    } catch (error) {
      console.error('[EventBuffer] Failed to persist activities:', error);
    }
  }

  /**
   * Check circuit breaker state
   */
  private isCircuitOpen(): boolean {
    if (this.circuitState === 'OPEN') {
      const timeSinceFailure = Date.now() - this.lastFailureTime;
      if (timeSinceFailure > this.CIRCUIT_RESET_TIMEOUT) {
        this.circuitState = 'HALF_OPEN';
        console.log('[EventBuffer] Circuit breaker entering HALF_OPEN state');
        return false;
      }
      return true;
    }
    return false;
  }

  /**
   * Record successful request
   */
  private onSuccess() {
    if (this.circuitState === 'HALF_OPEN') {
      this.circuitState = 'CLOSED';
      console.log('[EventBuffer] Circuit breaker CLOSED');
    }
    this.failureCount = 0;
  }

  /**
   * Record failed request
   */
  private onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.MAX_FAILURES) {
      this.circuitState = 'OPEN';
      console.log(`[EventBuffer] Circuit breaker OPEN after ${this.failureCount} failures`);
      vscode.window.showWarningMessage(
        'Activity sync paused due to connection issues. Will retry in 1 minute.'
      );
    }
  }

  start() {
    this.timer = setInterval(() => this.flush(), this.intervalMs);

    // Update current file info when editor changes
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) {
        this.currentFile = vscode.workspace.asRelativePath(editor.document.uri);
        this.currentLanguage = editor.document.languageId;
      }
    });

    // Update project name when workspace folders change
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      this.updateProjectName();
    });

    // Flush on document close
    vscode.workspace.onDidCloseTextDocument(() => this.flush());
  }

  add(
    eventType: 'typing' | 'click' | 'terminal_activity',
    extraData?: {
      keystrokes?: number;
      lines_added?: number;
      lines_removed?: number;
      clicks?: number;
      duration_seconds?: number; // Optional explicit duration from session tracker
      terminal_name?: string; // For terminal activities
    }
  ) {
    // Handle terminal activities separately (no file editor required)
    if (eventType === 'terminal_activity') {
      this.addTerminalActivity(extraData);
      return;
    }

    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const now = Date.now();

    // Use explicit duration if provided (from session tracker), otherwise calculate
    const duration = extraData?.duration_seconds ?? Math.round((now - this.lastEventTime) / 1000);
    const startedAt = new Date(now - (duration * 1000)).toISOString();
    const endedAt = new Date(now).toISOString();
    this.lastEventTime = now;

    const filePath = editor.document.uri.fsPath;

    // Get diff data if available
    let diffData = null;
    if (this.diffService && eventType === 'typing') {
      try {
        diffData = this.diffService.getDiffAndReset(filePath);
      } catch (error) {

        // Continue without diff data
      }
    }    // Get editor and OS information
    const editorInfo = this.getEditorInfo();
    const osInfo = this.getOperatingSystem();

    const activity: CodingActivityEvent = {
      event_type: eventType,
      duration: Math.max(1, duration), // at least 1 second
      file_path: vscode.workspace.asRelativePath(editor.document.uri),
      language: editor.document.languageId,
      project_name: this.projectName,
      editor: editorInfo,
      operating_system: osInfo,
      started_at: startedAt,
      ended_at: endedAt,
      keystrokes: extraData?.keystrokes ?? 0,
      lines_added: diffData?.linesAdded ?? extraData?.lines_added ?? 0,
      lines_removed: diffData?.linesRemoved ?? extraData?.lines_removed ?? 0,
      metadata: {
        session_id: this.sessionId,
        characters_typed: extraData?.keystrokes ?? 0,
        ...(diffData?.diff && { diff: diffData.diff })
      }
    };

    this.buffer.push(activity);

    if (this.buffer.length >= this.batchSize) {
      this.flush();
    }
  }

  private async flush() {
    if (!this.buffer.length) {
      return;
    }

    // Check circuit breaker
    if (this.isCircuitOpen()) {
      console.log('[EventBuffer] Circuit breaker is OPEN, skipping flush');
      return;
    }

    const batch = this.buffer.splice(0);
    const endpoint = `${this.apiUrl}/api/coding-activities/batch`;

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${this.apiToken}`
        },
        body: JSON.stringify({ activities: batch })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[EventBuffer] Flush failed with status:', response.status, errorText);
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const result = await response.json();
      this.onSuccess();

      // Show success notification (optional)
      vscode.window.setStatusBarMessage(`✓ Synced ${batch.length} activities`, 3000);

    } catch (err) {
      this.onFailure();

      // Persist to storage instead of re-queuing to prevent memory issues
      await this.persistToStorage(batch);

      // Log detailed error for debugging (not shown to user)
      console.error('[EventBuffer] Failed to sync activities:', err);

      // Show safe error notification without exposing internal details
      if (this.circuitState !== 'OPEN') {
        vscode.window.showWarningMessage('Failed to sync activities. Saved locally and will retry.');
      }
    }
  }

  setDiffService(diffService: DiffService | null) {
    this.diffService = diffService;

  }

  /**
   * Add terminal activity to buffer
   */
  private addTerminalActivity(extraData?: {
    duration_seconds?: number;
    terminal_name?: string;
  }) {
    const now = Date.now();
    const duration = extraData?.duration_seconds ?? 1;
    const startedAt = new Date(now - (duration * 1000)).toISOString();
    const endedAt = new Date(now).toISOString();

    const editorInfo = this.getEditorInfo();
    const osInfo = this.getOperatingSystem();

    const activity: CodingActivityEvent = {
      event_type: 'typing', // Backend expects 'typing' or 'click', use typing for terminal
      duration: Math.max(1, duration),
      file_path: `terminal://${extraData?.terminal_name || 'unknown'}`,
      language: 'terminal',
      project_name: this.projectName,
      editor: editorInfo,
      operating_system: osInfo,
      started_at: startedAt,
      ended_at: endedAt,
      keystrokes: 0,
      lines_added: 0,
      lines_removed: 0,
      metadata: {
        session_id: this.sessionId,
        terminal_name: extraData?.terminal_name || 'unknown',
        activity_type: 'terminal'
      }
    };

    this.buffer.push(activity);

    // Auto-flush if buffer is full
    if (this.buffer.length >= this.batchSize) {
      this.flush();
    }
  }

  /**
   * Get editor name and version
   */
  private getEditorInfo(): string {
    return `VS Code ${vscode.version}`;
  }

  /**
   * Get operating system information
   */
  private getOperatingSystem(): string {
    const platform = process.platform;
    const osMap: { [key: string]: string } = {
      'darwin': 'macOS',
      'win32': 'Windows',
      'linux': 'Linux',
      'freebsd': 'FreeBSD',
      'openbsd': 'OpenBSD',
      'sunos': 'SunOS',
      'aix': 'AIX'
    };

    return osMap[platform] || platform;
  }

  stop() {

    if (this.timer) clearInterval(this.timer);
    this.flush();
  }
}
