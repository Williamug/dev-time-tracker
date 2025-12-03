import * as vscode from 'vscode';
import { DiffService } from './services/DiffService';

export interface CodingActivityEvent {
  event_type: 'typing' | 'file_save' | 'file_open' | 'file_close' | 'debug' | 'mousemove';
  duration: number;
  file_path: string;
  language: string;
  project_name: string;
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

  constructor(
    private apiUrl: string,
    private apiToken: string,
    private sessionId: string,
    diffService?: DiffService | null
  ) {
    // Remove trailing slashes from API URL
    this.apiUrl = apiUrl.replace(/\/+$/, '');

    // Extract project name from workspace
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder) {
      this.projectName = workspaceFolder.name;
    }

    this.diffService = diffService || null;

    console.log('[EventBuffer] Initialized with:', {
      apiUrl: this.apiUrl,
      hasToken: !!this.apiToken,
      sessionId: this.sessionId,
      projectName: this.projectName,
      hasDiffService: !!this.diffService
    });
  }

  start() {
    console.log('[EventBuffer] Starting buffer with 30s flush interval');
    this.timer = setInterval(() => this.flush(), this.intervalMs);

    // Update current file info when editor changes
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) {
        this.currentFile = vscode.workspace.asRelativePath(editor.document.uri);
        this.currentLanguage = editor.document.languageId;
      }
    });

    // Flush on document close
    vscode.workspace.onDidCloseTextDocument(() => this.flush());
  }

  add(
    eventType: 'typing' | 'file_save' | 'file_open' | 'file_close' | 'mousemove',
    extraData?: {
      keystrokes?: number;
      lines_added?: number;
      lines_removed?: number;
    }
  ) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const now = Date.now();
    const duration = Math.round((now - this.lastEventTime) / 1000); // seconds
    const startedAt = new Date(now - (duration * 1000)).toISOString();
    const endedAt = new Date(now).toISOString();
    this.lastEventTime = now;

    const filePath = editor.document.uri.fsPath;

    // Get diff data if available
    let diffData = null;
    if (this.diffService && (eventType === 'typing' || eventType === 'file_save')) {
      try {
        diffData = this.diffService.getDiffAndReset(filePath);
      } catch (error) {
        console.error('[EventBuffer] Error getting diff data:', error);
        // Continue without diff data
      }
    }    const activity: CodingActivityEvent = {
      event_type: eventType,
      duration: Math.max(1, duration), // at least 1 second
      file_path: vscode.workspace.asRelativePath(editor.document.uri),
      language: editor.document.languageId,
      project_name: this.projectName,
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
    console.log(`[EventBuffer] Added ${eventType} event. Buffer size: ${this.buffer.length}`, {
      keystrokes: activity.keystrokes,
      lines_added: activity.lines_added,
      lines_removed: activity.lines_removed,
      hasDiff: !!diffData?.diff
    });

    if (this.buffer.length >= this.batchSize) {
      console.log('[EventBuffer] Buffer full, flushing...');
      this.flush();
    }
  }

  private async flush() {
    if (!this.buffer.length) {
      console.log('[EventBuffer] Nothing to flush');
      return;
    }

    const batch = this.buffer.splice(0);
    const endpoint = `${this.apiUrl}/api/coding-activities/batch`;

    console.log(`[EventBuffer] Flushing ${batch.length} events to ${endpoint}`);

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
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const result = await response.json();
      console.log(`[EventBuffer] Successfully flushed ${batch.length} events:`, result);

      // Show success notification (optional)
      vscode.window.setStatusBarMessage(`✓ Synced ${batch.length} activities`, 3000);

    } catch (err) {
      console.error('[EventBuffer] Flush failed:', err);

      // Re-queue events on failure
      this.buffer.unshift(...batch);

      // Show error notification
      vscode.window.showErrorMessage(`Failed to sync activities: ${err}`);
    }
  }

  setDiffService(diffService: DiffService | null) {
    this.diffService = diffService;
    console.log('[EventBuffer] DiffService updated:', !!diffService);
  }

  stop() {
    console.log('[EventBuffer] Stopping and flushing remaining events');
    if (this.timer) clearInterval(this.timer);
    this.flush();
  }
}
