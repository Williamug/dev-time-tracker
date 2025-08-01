import * as vscode from 'vscode';
import { MetricsCollector, MetricsPayload } from '../models/Metrics';

export class MetricsService {
  private static instance: MetricsService;
  private metricsCollector = MetricsCollector.getInstance();
  private disposables: vscode.Disposable[] = [];
  private syncInterval: NodeJS.Timeout | null = null;
  private lastSyncTime: Date | null = null;
  private apiUrl: string | null = null;
  private apiToken: string | null = null;
  private isSyncing = false;

  private constructor() {
    this.initialize();
  }

  public static getInstance(): MetricsService {
    if (!MetricsService.instance) {
      MetricsService.instance = new MetricsService();
    }
    return MetricsService.instance;
  }

  private initialize() {
    this.loadConfig();
    this.setupEventListeners();
    this.startSyncInterval();
  }

  private getDefaultCodeMetrics() {
    return {
      lines: { added: 0, removed: 0, total: 0 },
      files: { modified: 0, created: 0, deleted: 0 },
      fileTypes: {},
      complexity: { max: 0, average: 0 }
    };
  }

  private loadConfig() {
    const config = vscode.workspace.getConfiguration('devtimetracker');
    this.apiUrl = config.get<string>('apiUrl') || null;
    this.apiToken = config.get<string>('apiToken') || null;
    
    // Listen for config changes
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('devtimetracker')) {
        this.loadConfig();
      }
    });
  }

  private setupEventListeners() {
    // Document changes
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument(e => {
        this.handleDocumentChange(e);
      })
    );

    // File operations
    this.disposables.push(
      vscode.workspace.onDidCreateFiles(e => {
        this.handleFilesCreated(e.files);
      }),
      vscode.workspace.onDidDeleteFiles(e => {
        this.handleFilesDeleted(e.files);
      }),
      vscode.workspace.onDidRenameFiles(e => {
        this.handleFilesRenamed(e.files);
      })
    );

    // Editor events
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor(e => {
        if (e) {
          this.handleEditorChange(e);
        }
      })
    );
  }

  private startSyncInterval() {
    // Sync every 5 minutes
    this.syncInterval = setInterval(() => {
      this.syncWithBackend();
    }, 5 * 60 * 1000);
  }

  private async syncWithBackend() {
    if (this.isSyncing || !this.apiUrl || !this.apiToken) {
      return;
    }

    this.isSyncing = true;
    try {
      const metrics = this.metricsCollector.getMetrics();
      const response = await fetch(`${this.apiUrl}/api/metrics`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiToken}`
        },
        body: JSON.stringify(metrics)
      });

      if (response.ok) {
        this.lastSyncTime = new Date();
        console.log('[Metrics] Successfully synced with backend');
      } else {
        console.error('[Metrics] Failed to sync with backend:', await response.text());
      }
    } catch (error) {
      console.error('[Metrics] Error syncing with backend:', error);
    } finally {
      this.isSyncing = false;
    }
  }

  // Event Handlers
  private handleDocumentChange(e: vscode.TextDocumentChangeEvent) {
    // Track lines changed, complexity, etc.
    const changes = e.contentChanges;
    const metrics = this.metricsCollector.getMetrics();
    
    // Initialize code metrics if not present
    if (!metrics.code) {
      this.metricsCollector.updateMetrics({
        code: this.getDefaultCodeMetrics()
      });
      return;
    }
    
    // Create a copy of metrics to work with
    const updatedMetrics = { ...metrics.code };

    // Update line metrics
    changes.forEach(change => {
      const addedLines = change.text.split('\n').length - 1;
      const removedLines = change.range.end.line - change.range.start.line + 1;
      
      updatedMetrics.lines.added += Math.max(0, addedLines - 1);
      updatedMetrics.lines.removed += removedLines;
      updatedMetrics.lines.total = updatedMetrics.lines.added - updatedMetrics.lines.removed;
    });

    // Update file type metrics
    const fileExtension = e.document.fileName.split('.').pop() || '';
    if (fileExtension) {
      updatedMetrics.fileTypes[fileExtension] = (updatedMetrics.fileTypes[fileExtension] || 0) + 1;
    }

    // Update modified files count
    updatedMetrics.files.modified += 1;

    this.metricsCollector.updateMetrics({
      code: updatedMetrics
    });
  }

  private handleEditorChange(editor: vscode.TextEditor) {
    // Track project and file changes
    const document = editor.document;
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    const projectName = workspaceFolder?.name || 'Unknown';
    
    this.metricsCollector.updateMetrics({
      project: {
        currentProject: projectName,
        projects: {
          [projectName]: {
            timeSpent: 0, // Will be updated by timer
            lastActive: new Date(),
            fileTypes: { [document.languageId]: 1 }
          }
        }
      }
    });
  }

  private handleFilesCreated(files: readonly vscode.Uri[]) {
    const metrics = this.metricsCollector.getMetrics();
    if (!metrics.code) return;

    metrics.code.files.created += files.length;
    this.metricsCollector.updateMetrics(metrics);
  }

  private handleFilesDeleted(files: readonly vscode.Uri[]) {
    const metrics = this.metricsCollector.getMetrics();
    if (!metrics.code) return;

    metrics.code.files.deleted += files.length;
    this.metricsCollector.updateMetrics(metrics);
  }

  private handleFilesRenamed(files: readonly { oldUri: vscode.Uri; newUri: vscode.Uri }[]) {
    // Track file renames
    const metrics = this.metricsCollector.getMetrics();
    if (!metrics.code) return;

    metrics.code.files.modified += files.length;
    this.metricsCollector.updateMetrics(metrics);
  }

  // Public API
  public getMetrics(): Partial<MetricsPayload> {
    return this.metricsCollector.getMetrics();
  }

  public handleActivity() {
    const metrics = this.metricsCollector.getMetrics();
    if (!metrics.productivity) return;
    
    // Update focus time (in seconds)
    const now = new Date();
    const lastUpdate = metrics.timestamp || now;
    const secondsActive = Math.floor((now.getTime() - lastUpdate.getTime()) / 1000);
    
    // Update productive hours (current hour)
    const currentHour = now.getHours().toString().padStart(2, '0');
    
    this.metricsCollector.updateMetrics({
      timestamp: now,
      productivity: {
        ...metrics.productivity,
        focusTime: (metrics.productivity.focusTime || 0) + secondsActive,
        productiveHours: {
          ...metrics.productivity.productiveHours,
          [currentHour]: (metrics.productivity.productiveHours?.[currentHour] || 0) + secondsActive
        }
      }
    });
  }

  public async forceSync(): Promise<boolean> {
    await this.syncWithBackend();
    return !this.isSyncing;
  }

  public dispose() {
    // Clean up resources
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
    
    this.disposables.forEach(d => d.dispose());
    this.disposables = [];
    
    // Do one final sync before disposing
    this.syncWithBackend().catch(console.error);
  }
}
