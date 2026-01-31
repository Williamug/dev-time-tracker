import * as vscode from 'vscode';
import * as zlib from 'zlib';
import { promisify } from 'util';
import { StatusBarManager } from './statusBarManager';

const gzip = promisify(zlib.gzip);

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
  private batchSize = 20; // Now dynamic, not readonly
  private lastEventTime = Date.now();
  private currentFile: string = '';
  private currentLanguage: string = '';
  private projectName: string = '';

  // Circuit breaker state
  private failureCount = 0;
  private lastFailureTime = 0;
  private circuitState: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  private readonly MAX_FAILURES = 5;
  private readonly CIRCUIT_RESET_TIMEOUT = 60000; // 1 minute

  // Persistent storage
  private context?: vscode.ExtensionContext;

  // Adaptive batching - network condition tracking
  private avgResponseTime = 500;
  private lastResponseTime = 0;
  private consecutiveSuccesses = 0;
  private consecutiveFailures = 0;
  private readonly MIN_BATCH_SIZE = 10;
  private readonly MAX_BATCH_SIZE = 100;
  private readonly OPTIMAL_RESPONSE_TIME = 1000;

  // Compression settings
  private enableCompression = true; // Enabled with Laravel DecompressGzipRequest middleware
  private compressionThreshold = 1024; // Compress if payload > 1KB

  // Status bar manager for UI updates
  private statusBarManager?: StatusBarManager;

  constructor(
    private apiUrl: string,
    private apiToken: string,
    private sessionId: string,
    context: vscode.ExtensionContext
  ) {
    // Remove trailing slashes from API URL
    this.apiUrl = apiUrl.replace(/\/+$/, '');

    // Update project name dynamically
    this.updateProjectName();

    this.context = context;

    // Get StatusBarManager instance (may be null if not initialized yet)
    this.statusBarManager = StatusBarManager.getInstance() || undefined;

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
        this.buffer.push(...pending);
        // Clear storage after loading
        await this.context.globalState.update('pending_activities', []);
        // Update status bar with pending count
        this.updateStatusBar();
      }
    } catch (error) {
      // Silently fail
    }
  }

  /**
   * Get pending activities count (for status bar)
   */
  public getPendingCount(): number {
    return this.buffer.length;
  }

  /**
   * Update status bar with pending activities count
   */
  private updateStatusBar() {
    const isOffline = this.circuitState === 'OPEN';

    // Update via StatusBarManager if available
    if (this.statusBarManager) {
      this.statusBarManager.updateSyncQueueStatus(this.buffer.length, isOffline);
    }

    // Also show temporary message for significant changes
    if (this.buffer.length > 0 && this.buffer.length % 10 === 0) {
      const icon = isOffline ? '⚠️' : '📤';
      const status = isOffline ? 'offline' : 'queued';
      vscode.window.setStatusBarMessage(
        `${icon} ${this.buffer.length} activities ${status}`,
        3000
      );
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
    } catch (error) {
      // Silently fail
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
      // Update status bar to show we're back online
      this.updateStatusBar();
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
      // Update status bar to show offline state
      this.updateStatusBar();
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
        // Normalize language when storing it
        const normalized = this.normalizeLanguage(
          editor.document.languageId,
          editor.document.uri.fsPath
        );
        this.currentLanguage = normalized || editor.document.languageId;
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

    // Get editor and OS information
    const editorInfo = this.getEditorInfo();
    const osInfo = this.getOperatingSystem();

    // Normalize language - this will skip if it's not a real programming language
    const normalizedLanguage = this.normalizeLanguage(
      editor.document.languageId,
      editor.document.uri.fsPath
    );

    // Skip tracking for non-programming files
    if (!normalizedLanguage) {
      return;
    }

    const activity: CodingActivityEvent = {
      event_type: eventType,
      duration: Math.max(1, duration), // at least 1 second
      file_path: vscode.workspace.asRelativePath(editor.document.uri),
      language: normalizedLanguage,
      project_name: this.projectName,
      editor: editorInfo,
      operating_system: osInfo,
      started_at: startedAt,
      ended_at: endedAt,
      keystrokes: extraData?.keystrokes ?? 0,
      lines_added: extraData?.lines_added ?? 0,
      lines_removed: extraData?.lines_removed ?? 0,
      metadata: {
        session_id: this.sessionId,
        characters_typed: extraData?.keystrokes ?? 0
      }
    };

    this.buffer.push(activity);

    // Update status bar when buffer size changes
    if (this.buffer.length > 0 && this.buffer.length % 5 === 0) {
      this.updateStatusBar();
    }

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
      this.updateStatusBar(); // Show user how many are queued
      return;
    }

    const batch = this.buffer.splice(0);
    const endpoint = `${this.apiUrl}/api/coding-activities/batch`;
    const startTime = Date.now();

    try {
      const payload = JSON.stringify({ activities: batch });
      const payloadSize = Buffer.byteLength(payload, 'utf8');

      // Prepare request body and headers
      let body: string | Buffer = payload;
      const headers: Record<string, string> = {
        'Accept': 'application/json',
        'Authorization': `Bearer ${this.apiToken}`
      };

      // Compress if enabled and payload is large enough
      if (this.enableCompression && payloadSize > this.compressionThreshold) {
        try {
          const compressed = await gzip(Buffer.from(payload, 'utf8'));
          body = compressed;
          headers['Content-Type'] = 'application/json';
          headers['Content-Encoding'] = 'gzip';
        } catch (compressionError) {
          headers['Content-Type'] = 'application/json';
          body = payload;
        }
      } else {
        headers['Content-Type'] = 'application/json';
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body
      });

      const responseTime = Date.now() - startTime;
      this.lastResponseTime = responseTime;

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const result = await response.json();
      this.onSuccess();
      this.adaptBatchSize(responseTime, true);

      // Update status bar to reflect successful sync (may hide if buffer is empty)
      this.updateStatusBar();

      // Show success notification with performance info
      const compressionInfo = headers['Content-Encoding'] === 'gzip' ? ' (compressed)' : '';
      vscode.window.setStatusBarMessage(
        `✓ Synced ${batch.length} activities in ${responseTime}ms${compressionInfo}`,
        3000
      );

    } catch (err) {
      this.onFailure();
      this.adaptBatchSize(this.lastResponseTime || 5000, false);

      // Persist to storage instead of re-queuing to prevent memory issues
      await this.persistToStorage(batch);

      // Log the actual error for debugging
      const errorMessage = err instanceof Error ? err.message : String(err);

      // Check for specific error types
      if (errorMessage.includes('HTTP 401') || errorMessage.includes('Unauthenticated')) {
        // Token expired or invalid
        vscode.window.showErrorMessage(
          'Dev Time Tracker: API token expired or invalid. Please update your token in settings.',
          'Open Settings'
        ).then(selection => {
          if (selection === 'Open Settings') {
            vscode.commands.executeCommand('workbench.action.openSettings', 'devtimetracker.apiToken');
          }
        });
      } else if (errorMessage.includes('HTTP 403')) {
        // Forbidden - permissions issue
        vscode.window.showErrorMessage(
          'Dev Time Tracker: Access denied. Check your API permissions.',
          'Open Settings'
        ).then(selection => {
          if (selection === 'Open Settings') {
            vscode.commands.executeCommand('workbench.action.openSettings', 'devtimetracker');
          }
        });
      } else if (this.circuitState !== 'OPEN') {
        // Generic error - show safe message
        vscode.window.showWarningMessage(
          `Failed to sync activities (${this.buffer.length} queued). Saved locally and will retry.`
        );
      }

      // Update status bar to show queued count
      this.updateStatusBar();
    }
  }

  /**
   * Adapt batch size based on network performance
   */
  private adaptBatchSize(responseTime: number, success: boolean) {
    // Update moving average of response time
    this.avgResponseTime = (this.avgResponseTime * 0.7) + (responseTime * 0.3);

    if (success) {
      this.consecutiveSuccesses++;
      this.consecutiveFailures = 0;

      // If response is fast and we've had multiple successes, increase batch size
      if (this.avgResponseTime < this.OPTIMAL_RESPONSE_TIME &&
          this.consecutiveSuccesses >= 3 &&
          this.batchSize < this.MAX_BATCH_SIZE) {
        this.batchSize = Math.min(this.batchSize + 10, this.MAX_BATCH_SIZE);
        this.consecutiveSuccesses = 0;
      }
    } else {
      this.consecutiveFailures++;
      this.consecutiveSuccesses = 0;

      // If we're having failures or slow responses, decrease batch size
      if (this.consecutiveFailures >= 2 && this.batchSize > this.MIN_BATCH_SIZE) {
        this.batchSize = Math.max(this.batchSize - 10, this.MIN_BATCH_SIZE);
        this.consecutiveFailures = 0;
      } else if (this.avgResponseTime > this.OPTIMAL_RESPONSE_TIME * 2 &&
                 this.batchSize > this.MIN_BATCH_SIZE) {
        this.batchSize = Math.max(this.batchSize - 5, this.MIN_BATCH_SIZE);
      }
    }
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
      language: 'Shell', // Normalize terminal to Shell
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
    // Detect the actual editor being used
    // VS Code forks like Cursor, Windsurf, etc. have different app names
    const appName = vscode.env.appName || 'VS Code';
    return `${appName} ${vscode.version}`;
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

  /**
   * Normalize language ID to actual programming language
   * Filters out non-programming file types
   */
  private normalizeLanguage(languageId: string, filePath: string): string | null {
    // Map VS Code language IDs to standard language names
    const languageMap: { [key: string]: string } = {
      // JavaScript/TypeScript ecosystem
      'javascript': 'JavaScript',
      'javascriptreact': 'JavaScript',
      'jsx': 'JavaScript',
      'typescript': 'TypeScript',
      'typescriptreact': 'TypeScript',
      'tsx': 'TypeScript',
      'vue': 'Vue',
      'svelte': 'Svelte',
      'astro': 'Astro',
      'coffeescript': 'CoffeeScript',

      // Web languages
      'html': 'HTML',
      'css': 'CSS',
      'scss': 'SCSS',
      'sass': 'Sass',
      'less': 'Less',
      'stylus': 'Stylus',

      // Backend languages
      'php': 'PHP',
      'python': 'Python',
      'java': 'Java',
      'csharp': 'C#',
      'cpp': 'C++',
      'c': 'C',
      'go': 'Go',
      'rust': 'Rust',
      'ruby': 'Ruby',
      'perl': 'Perl',
      'r': 'R',
      'swift': 'Swift',
      'kotlin': 'Kotlin',
      'scala': 'Scala',
      'dart': 'Dart',
      'lua': 'Lua',
      'elixir': 'Elixir',
      'erlang': 'Erlang',
      'haskell': 'Haskell',
      'clojure': 'Clojure',
      'fsharp': 'F#',
      'ocaml': 'OCaml',
      'nim': 'Nim',
      'zig': 'Zig',
      'crystal': 'Crystal',
      'julia': 'Julia',

      // Shell/scripting
      'shellscript': 'Shell',
      'bash': 'Shell',
      'zsh': 'Shell',
      'fish': 'Shell',
      'powershell': 'PowerShell',
      'bat': 'Batch',
      'cmd': 'Batch',

      // Data/config formats
      'json': 'JSON',
      'jsonc': 'JSON',
      'json5': 'JSON',
      'yaml': 'YAML',
      'yml': 'YAML',
      'toml': 'TOML',
      'xml': 'XML',
      'ini': 'INI',
      'properties': 'Properties',
      'env': 'ENV',
      'dotenv': 'ENV',

      // Database & Query
      'sql': 'SQL',
      'plsql': 'SQL',
      'mysql': 'SQL',
      'postgres': 'SQL',
      'postgresql': 'SQL',
      'tsql': 'SQL',
      'graphql': 'GraphQL',
      'cypher': 'Cypher',

      // Markup/documentation
      'markdown': 'Markdown',
      'mdx': 'MDX',
      'latex': 'LaTeX',
      'tex': 'LaTeX',
      'restructuredtext': 'reStructuredText',
      'asciidoc': 'AsciiDoc',

      // Template languages
      'blade': 'PHP', // Laravel Blade is PHP
      'twig': 'PHP',
      'handlebars': 'Handlebars',
      'ejs': 'JavaScript',
      'pug': 'Pug',
      'jade': 'Pug',
      'haml': 'Ruby',
      'razor': 'C#',
      'jsp': 'Java',
      'erb': 'Ruby',
      'liquid': 'Liquid',
      'nunjucks': 'Nunjucks',
      'jinja': 'Python',
      'django-html': 'Python',

      // Mobile development
      'objective-c': 'Objective-C',
      'objective-cpp': 'Objective-C++',
      'groovy': 'Groovy',

      // Flutter & React Native (framework-specific files)
      'flutter': 'Dart',
      'flutter-widget': 'Dart',

      // Systems & Low-level
      'assembly': 'Assembly',
      'asm': 'Assembly',
      'verilog': 'Verilog',
      'vhdl': 'VHDL',

      // Functional & Academic
      'scheme': 'Scheme',
      'racket': 'Racket',
      'lisp': 'Lisp',
      'commonlisp': 'Common Lisp',
      'prolog': 'Prolog',

      // Game development
      'gdscript': 'GDScript',
      'glsl': 'GLSL',
      'hlsl': 'HLSL',
      'shaderlab': 'ShaderLab',

      // Blockchain & Smart Contracts
      'solidity': 'Solidity',

      // DevOps & Infrastructure
      'dockerfile': 'Docker',
      'makefile': 'Makefile',
      'cmake': 'CMake',
      'terraform': 'Terraform',
      'bicep': 'Bicep',
      'puppet': 'Puppet',
      'ansible': 'Ansible',
      'saltstack': 'SaltStack',

      // Data serialization
      'proto': 'Protocol Buffers',
      'thrift': 'Thrift',

      // Other
      'graphviz': 'GraphViz',
      'diff': 'Diff',
      'processing': 'Processing',
      'arduino': 'Arduino',
      'vb': 'Visual Basic',
      'fortran': 'Fortran',
      'fortran-modern': 'Fortran',
      'cobol': 'COBOL',
      'pascal': 'Pascal',
      'ada': 'Ada',
      'abap': 'ABAP',
      'apex': 'Apex',
      'vala': 'Vala',
      'd': 'D',
      'elm': 'Elm',
      'purescript': 'PureScript',
      'reason': 'Reason',
      'rescript': 'ReScript',
      'ballerina': 'Ballerina',
    };

    // Files/types to ignore (not actual programming)
    const ignorePatterns = [
      'plaintext',
      'log',
      'ignore',
      'git-commit',
      'git-rebase',
      'editorconfig',
      'gitignore',
      'dockerignore',
      'npmignore',
      'eslintignore',
      'prettierignore',
      'browserslistrc',
      'nvmrc',
      'npmrc',
      'instructions',
      'license',
      'txt',
      'csv',
      'tsv',
      'scminput',
      'search-result',
      'output',
      'code-runner-output',
      'interactive',
    ];

    // Special handling for certain file extensions
    const fileExtension = filePath.split('.').pop()?.toLowerCase();

    // Ignore common non-code files by extension
    const ignoreExtensions = [
      'log', 'txt', 'lock', 'sum', 'mod',
      'png', 'jpg', 'jpeg', 'gif', 'svg', 'ico', 'webp',
      'pdf', 'doc', 'docx', 'xls', 'xlsx',
      'zip', 'tar', 'gz', 'rar', '7z',
      'mp3', 'mp4', 'avi', 'mov', 'wav',
    ];

    // Check if it's an ignore pattern or extension
    if (ignorePatterns.includes(languageId.toLowerCase())) {
      return null;
    }

    if (fileExtension && ignoreExtensions.includes(fileExtension)) {
      return null;
    }

    // Special case: terminal activities should be tracked as Shell
    if (languageId === 'terminal') {
      return 'Shell';
    }

    // Special case: GitHub Actions workflows
    if (languageId === 'github-actions-workflow' || filePath.includes('.github/workflows/')) {
      return 'YAML';
    }

    // Special case: Jupyter notebooks
    if (languageId === 'jupyter') {
      return 'Python';
    }

    // Special case: React Native (detect by file path or content patterns)
    if (filePath.includes('react-native') ||
        filePath.includes('ReactNative') ||
        filePath.includes('/ios/') ||
        filePath.includes('/android/') && (languageId === 'javascript' || languageId === 'typescript' || languageId === 'javascriptreact' || languageId === 'typescriptreact')) {
      // Check if it's actually React Native by looking at common patterns
      if (languageId === 'javascript' || languageId === 'javascriptreact') {
        return 'React Native';
      }
      if (languageId === 'typescript' || languageId === 'typescriptreact') {
        return 'React Native';
      }
    }

    // Special case: Flutter (Dart files in Flutter projects)
    if (languageId === 'dart') {
      // Check if it's a Flutter project
      if (filePath.includes('flutter') ||
          filePath.includes('pubspec.yaml') ||
          filePath.includes('/lib/') ||
          filePath.includes('/test/')) {
        return 'Flutter';
      }
      return 'Dart';
    }

    // Special case: Expo (React Native framework)
    if (filePath.includes('expo') || filePath.includes('.expo')) {
      if (languageId === 'javascript' || languageId === 'javascriptreact') {
        return 'Expo';
      }
      if (languageId === 'typescript' || languageId === 'typescriptreact') {
        return 'Expo';
      }
    }

    // Return mapped language or capitalize original if it's a known programming language
    const mapped = languageMap[languageId.toLowerCase()];
    if (mapped) {
      return mapped;
    }

    // For unknown languages, capitalize the first letter
    // This handles new or uncommon languages gracefully
    if (languageId.length > 0 && !ignorePatterns.includes(languageId)) {
      return languageId.charAt(0).toUpperCase() + languageId.slice(1);
    }

    return null;
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.flush();
  }
}
