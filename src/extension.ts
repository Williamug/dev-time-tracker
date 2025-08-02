import * as vscode from 'vscode';
import { SessionManager } from './sessionManager';
import { EventBuffer } from './buffer';
import { EventListener } from './eventListener';
import { StatusBarManager } from './statusBarManager';
import { MetricsService } from './services/MetricsService';
import { GitService } from './services/GitService';
import { HealthService } from './services/HealthService';
import { BackendService } from './services/BackendService';
import { CustomReminderService } from './services/CustomReminderService';

// Track user activity state
let lastActivityTime = Date.now();
const INACTIVITY_THRESHOLD = 5000; // 5 seconds for testing (change to 300000 for 5 minutes in production)
let activityCheckInterval: NodeJS.Timeout | null = null;
let statusBarManager: StatusBarManager | null = null;

// Update activity status based on user interaction
function updateActivityStatus() {
  if (!statusBarManager) return;
  
  const now = Date.now();
  const isActive = now - lastActivityTime < INACTIVITY_THRESHOLD;
  console.log(`[Activity] ${isActive ? 'Active' : 'Idle'} (${new Date(lastActivityTime).toLocaleTimeString()})`);
  statusBarManager.updateActivityStatus(isActive);
}

// Track user activity
function trackUserActivity(reason: string) {
  const oldTime = lastActivityTime;
  lastActivityTime = Date.now();
  console.log(`[Activity] Activity detected (${reason}) - Last: ${new Date(oldTime).toLocaleTimeString()}, Now: ${new Date(lastActivityTime).toLocaleTimeString()}`);
  updateActivityStatus();
}

export async function activate(ctx: vscode.ExtensionContext) {
  console.log('[Extension] Activating Dev Time Tracker...');
  
  const cfg = vscode.workspace.getConfiguration('devtimetracker');
  const apiUrl = cfg.get<string>('apiUrl');
  const apiToken = cfg.get<string>('apiToken');
  
  console.log('[Extension] Configuration loaded:', { hasApiUrl: !!apiUrl, hasApiToken: !!apiToken });

  // Initialize services with backend support
  let backendService: BackendService | null = null;
  let metricsService: MetricsService | null = null;
  let gitService: GitService | null = null;
  let healthService: HealthService | null = null;
  let customReminderService: CustomReminderService | null = null;

  // Initialize backend service if configured
  if (apiUrl) {
    try {
      backendService = BackendService.getInstance();
      const initialized = await backendService.initialize();
      
      if (initialized) {
        console.log('[Backend] Successfully connected to backend service');
        
        // Sync settings from backend
        try {
          const synced = await backendService.syncSettings();
          if (synced) {
            console.log('[Backend] Successfully synced settings from backend');
          }
        } catch (syncError) {
          console.error('[Backend] Failed to sync settings:', syncError);
        }
        
        // Register configuration change listener
        vscode.workspace.onDidChangeConfiguration(async (e) => {
          if (e.affectsConfiguration('devtimetracker')) {
            console.log('[Backend] Configuration changed, reinitializing...');
            await backendService?.initialize();
            
            // Resync settings after reinitialization
            try {
              await backendService?.syncSettings();
            } catch (syncError) {
              console.error('[Backend] Failed to resync settings:', syncError);
            }
          }
        });
        
        // Initialize services with backend support
        metricsService = MetricsService.getInstance(backendService);
        gitService = GitService.getInstance(backendService);
        healthService = HealthService.getInstance(backendService, ctx);
        customReminderService = CustomReminderService.getInstance(ctx);
      } else {
        throw new Error('Backend initialization failed');
      }
    } catch (error) {
      console.error('[Backend] Failed to initialize:', error);
      vscode.window.showWarningMessage('Failed to connect to Dev Time Tracker backend. Running in local mode.');
      // Fall back to local mode
      metricsService = MetricsService.getInstance();
      gitService = GitService.getInstance();
      healthService = HealthService.getInstance(undefined, ctx);
      customReminderService = CustomReminderService.getInstance(ctx);
    }
  } else {
    console.log('[Backend] No API URL configured, running in local mode');
    vscode.window.showInformationMessage('Dev Time Tracker is running in local mode. Configure backend in settings for full features.');
    // Initialize services without backend
    metricsService = MetricsService.getInstance();
    gitService = GitService.getInstance();
    healthService = HealthService.getInstance();
    customReminderService = CustomReminderService.getInstance(ctx);
  }
  
  // Initialize status bar manager
  statusBarManager = StatusBarManager.getInstance(ctx);
  if (!statusBarManager) {
    console.error('[Extension] Failed to initialize StatusBarManager');
    return;
  }

  try {
    // Initialize session manager and event buffer only if API URL is provided
    if (apiUrl) {
      const sessionManager = new SessionManager(apiUrl, apiToken || '', ctx);
      const sessionId = await sessionManager.startSession();
      const eventBuffer = new EventBuffer(apiUrl, apiToken || '', sessionId);
      eventBuffer.start();
      ctx.subscriptions.push({ dispose: () => eventBuffer.stop() });

      const listener = new EventListener(ctx, eventBuffer, sessionId);
      listener.start();
      console.log('[Extension] Backend integration initialized');
    } else {
      console.log('[Extension] Running in local mode - no backend integration');
    }

  } catch (error) {
    console.error('[Extension] Error initializing backend integration:', error);
    vscode.window.showWarningMessage('Dev Time Tracker: Running in local mode - backend integration disabled');
  }

  // Set up event listeners for user activity
  console.log('[Extension] Setting up activity listeners...');
  
  // Forward activity events to metrics service
  const metrics = MetricsService.getInstance();
  const trackActivity = (type: string) => {
    console.log(`[Activity] ${type}`);
    metrics.handleActivity();
  };
  
  const activityEvents: vscode.Disposable[] = [
    // Editor events
    vscode.window.onDidChangeActiveTextEditor((e) => {
      console.log('[Activity] Active editor changed:', e?.document.uri.fsPath);
      trackUserActivity('editor change');
    }),
    
    vscode.window.onDidChangeTextEditorSelection((e) => {
      console.log('[Activity] Text selection changed in:', e.textEditor.document.uri.fsPath);
      trackUserActivity('selection change');
    }),
    
    vscode.window.onDidChangeTextEditorVisibleRanges((e) => {
      console.log('[Activity] Visible ranges changed in:', e.textEditor.document.uri.fsPath);
      trackUserActivity('visible ranges change');
    }),
    
    vscode.workspace.onDidChangeTextDocument((e) => {
      console.log('[Activity] Document changed:', e.document.uri.fsPath);
      trackUserActivity('document change');
    }),
    
    // Window focus events
    vscode.window.onDidChangeWindowState((e) => {
      console.log(`[Activity] Window focus changed: ${e.focused ? 'focused' : 'unfocused'}`);
      if (e.focused) trackUserActivity('window focus');
    }),
    
    // Terminal events
    vscode.window.onDidChangeActiveTerminal((terminal) => {
      console.log('[Activity] Active terminal changed:', terminal?.name);
      trackUserActivity('terminal change');
    }),
    
    // Debug events
    vscode.debug.onDidStartDebugSession(() => {
      console.log('[Activity] Debug session started');
      trackUserActivity('debug session start');
    }),
    
    // File system events
    vscode.workspace.onDidCreateFiles((e) => {
      console.log('[Activity] Files created:', e.files.map(f => f.fsPath));
      trackUserActivity('file created');
    }),
    
    // Status bar click command
    vscode.commands.registerCommand('devtimetracker.forceActive', () => {
      console.log('[Activity] Manual activation triggered');
      trackUserActivity('manual activation');
    })
  ];
  
  // Add activity event listeners to subscriptions
  activityEvents.forEach(disposable => ctx.subscriptions.push(disposable));
  console.log('[Extension] Activity listeners registered');

  // Initial activity check
  trackUserActivity('initial activation');
  
  // Update activity status more frequently for better responsiveness
  activityCheckInterval = setInterval(() => {
    updateActivityStatus();
  }, 1000); // Check every second
  
  ctx.subscriptions.push(new vscode.Disposable(() => {
    activityEvents.forEach(disposable => disposable.dispose());
    if (statusBarManager) {
      statusBarManager.dispose();
    }
    // Clean up services
    MetricsService.getInstance().dispose();
    GitService.getInstance().dispose();
    HealthService.getInstance().dispose();
  }));

  // Register commands
  const showStatus = vscode.commands.registerCommand('devtimetracker.showStatus', () => {
    if (!statusBarManager) return;
    const sessionTime = statusBarManager.getSessionTime();
    const todayTime = statusBarManager.getTodayTime();
    const metrics = MetricsService.getInstance().getMetrics();
    
    let message = `Current Session: ${sessionTime}\n` +
                 `Today's Total: ${todayTime}`;
    
    if (metrics.code) {
      message += `\n\nCode Metrics:`;
      message += `\n- Lines: +${metrics.code.lines.added}/-${metrics.code.lines.removed}`;
      message += `\n- Files: ${Object.keys(metrics.code.fileTypes).length} types`;
    }
    
    if (metrics.project?.currentProject) {
      message += `\n\nCurrent Project: ${metrics.project.currentProject}`;
    }
    
    vscode.window.showInformationMessage(message);
  });
  ctx.subscriptions.push(showStatus);

  const togglePomodoro = vscode.commands.registerCommand('devtimetracker.togglePomodoro', () => {
    statusBarManager?.togglePomodoro();
  });
  ctx.subscriptions.push(togglePomodoro);

  // Initial update of activity status
  updateActivityStatus();
}

export async function deactivate() {
  await SessionManager.endSession();
}
