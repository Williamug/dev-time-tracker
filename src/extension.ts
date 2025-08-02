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
import { registerCustomReminderCommands } from './commands/manageCustomReminders';
import { ICustomReminder } from './models/CustomReminder';

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
  
  // Log available commands for debugging
  const availableCommands = await vscode.commands.getCommands(true);
  console.log('[Extension] Available commands:', availableCommands.filter((cmd: string) => cmd.startsWith('devtimetracker.')));
  
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
        
        // Initialize services with singleton pattern
        metricsService = MetricsService.getInstance(backendService);
        gitService = GitService.getInstance(backendService);
        healthService = HealthService.getInstance(backendService, ctx);
        
        // Initialize custom reminders with metrics integration
        customReminderService = CustomReminderService.getInstance(ctx, metricsService);
      }
    } catch (error) {
      console.error('[Backend] Error initializing backend service:', error);
      vscode.window.showErrorMessage('Failed to initialize backend service. Some features may be limited.');
    }
  }

  // Initialize status bar manager as a singleton
  statusBarManager = StatusBarManager.getInstance(ctx);
  
  // Initialize session manager
  const sessionManager = new SessionManager(apiUrl || '', apiToken || '', ctx);
  const sessionId = await sessionManager.startSession();
  
  // Initialize event buffer and listener
  const eventBuffer = new EventBuffer(apiUrl || '', apiToken || '', sessionId);
  const listener = new EventListener(ctx, eventBuffer, sessionId);
  listener.start();
  
  // Start the event buffer
  eventBuffer.start();
  
  // Set up activity tracking
  const activityEvents: vscode.Disposable[] = [
    // Editor events
    vscode.window.onDidChangeActiveTextEditor((e) => {
      console.log('[Activity] Active editor changed:', e?.document.uri.fsPath);
      trackUserActivity('editor changed');
    }),
    
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.contentChanges.length > 0) {
        trackUserActivity('document changed');
      }
    }),
    
    // Terminal events
    vscode.window.onDidChangeTerminalState(() => {
      trackUserActivity('terminal state changed');
    }),
    
    // Window events
    vscode.window.onDidChangeWindowState((e) => {
      if (e.focused) {
        trackUserActivity('window focus changed');
      }
    })
  ];
  
  // Add activity event listeners to subscriptions
  activityEvents.forEach(disposable => ctx.subscriptions.push(disposable));
  
  // Set up activity check interval
  activityCheckInterval = setInterval(() => {
    updateActivityStatus();
  }, 1000);
  
  // Clean up on deactivation
  ctx.subscriptions.push({
    dispose: () => {
      if (activityCheckInterval) {
        clearInterval(activityCheckInterval);
      }
      SessionManager.endSession();
      MetricsService.getInstance().dispose();
      HealthService.getInstance().dispose();
    }
  });

  // Register commands
  const disposables: vscode.Disposable[] = [];
  
  // 1. Show status command
  disposables.push(vscode.commands.registerCommand('devtimetracker.showStatus', () => {
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
  }));
  
  // 2. Toggle Pomodoro command
  disposables.push(vscode.commands.registerCommand('devtimetracker.togglePomodoro', () => {
    statusBarManager?.togglePomodoro();
  }));
  
  // 3. Add custom reminder command
  disposables.push(vscode.commands.registerCommand('devtimetracker.addCustomReminder', async () => {
    const customReminderService = CustomReminderService.getInstance(ctx);
    if (!customReminderService) {
      vscode.window.showErrorMessage('Custom reminder service is not available');
      return;
    }
    
    const title = await vscode.window.showInputBox({
      title: 'New Reminder',
      prompt: 'Enter a title for the reminder',
      validateInput: (value: string) => {
        if (!value || value.trim().length === 0) {
          return 'Title cannot be empty';
        }
        return null;
      },
    });
    
    if (title === undefined) return; // User cancelled
    
    const message = await vscode.window.showInputBox({
      title: 'New Reminder',
      prompt: 'Enter the reminder message',
    });
    
    if (message === undefined) return; // User cancelled
    
    // Create a default reminder with some basic conditions
    const reminder: Partial<ICustomReminder> = {
      title,
      message,
      interval: 1800, // 30 minutes in seconds
      enabled: true,
      conditions: {
        minTypingSpeed: 0, // Any typing speed
        minSessionDuration: 300, // 5 minutes in seconds
        activeDocumentLanguage: [] // Any language
      },
      notificationType: 'info',
      soundEnabled: true,
      actions: [
        { title: 'Snooze', action: 'snooze' },
        { title: 'Dismiss', action: 'dismiss' },
      ],
    };
    
    try {
      await customReminderService.addReminder(reminder);
      vscode.window.showInformationMessage(`Reminder "${title}" created successfully`);
    } catch (error) {
      console.error('Error creating reminder:', error);
      vscode.window.showErrorMessage(
        `Failed to create reminder: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }));
  
  // Register all disposables with the extension context
  disposables.forEach(disposable => ctx.subscriptions.push(disposable));
  
  // Register custom reminder commands
  registerCustomReminderCommands(ctx);

  // Initial update of activity status
  updateActivityStatus();
  
  // Log successful activation
  console.log('[Extension] Dev Time Tracker activated successfully');
  
  // Return the public API if needed
  return {
    // Add any public API methods here
  };
}

export async function deactivate() {
  await SessionManager.endSession();
}
