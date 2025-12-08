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

    // Flush on document close
    vscode.workspace.onDidCloseTextDocument(() => this.flush());
  }

  add(
    eventType: 'typing' | 'click',
    extraData?: {
      keystrokes?: number;
      lines_added?: number;
      lines_removed?: number;
      clicks?: number;
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
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const result = await response.json();

      // Show success notification (optional)
      vscode.window.setStatusBarMessage(`✓ Synced ${batch.length} activities`, 3000);

    } catch (err) {

      // Re-queue events on failure
      this.buffer.unshift(...batch);

      // Show error notification
      vscode.window.showErrorMessage(`Failed to sync activities: ${err}`);
    }
  }

  setDiffService(diffService: DiffService | null) {
    this.diffService = diffService;

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
