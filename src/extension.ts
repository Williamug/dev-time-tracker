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
  console.log('[Extension] Extension context:', ctx);
  console.log('[Extension] Extension path:', ctx.extensionPath);
  
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
  
  // Initialize HealthService first since it should work without backend
  console.log('[Extension] ===== STARTING HEALTH SERVICE INITIALIZATION =====');
  try {
    // Test status bar item creation
    try {
      const testStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1000);
      testStatusBarItem.text = '$(test) Test Item';
      testStatusBarItem.show();
      console.log('[Extension] ✓ Test status bar item created and shown');
    } catch (error) {
      console.error('[Extension] ✗ Failed to create test status bar item:', error);
    }
    
    // Initialize HealthService
    console.log('[Extension] Creating HealthService instance...');
    healthService = HealthService.getInstance(undefined, ctx);
    console.log('[Extension] ✓ HealthService instance created');
    
    // Verify HealthStatusBar instance
    if (!healthService.healthStatusBar) {
      console.error('[Extension] ✗ HealthStatusBar instance is null/undefined!');
    } else {
      console.log('[Extension] ✓ HealthStatusBar instance found');
      
      // Try to force show status bar items
      const types = ['break', 'posture', 'eyeStrain'] as const;
      for (const type of types) {
        try {
          console.log(`[Extension] Attempting to show ${type} status bar item...`);
          
          // Use type assertion to access the methods
          const statusBar = healthService.healthStatusBar as any;
          const methodName = `show${type.charAt(0).toUpperCase() + type.slice(1)}Reminder` as const;
          
          if (typeof statusBar[methodName] === 'function') {
            statusBar[methodName](1);
            console.log(`[Extension] ✓ ${type} status bar item shown`);
          } else {
            console.error(`[Extension] ✗ Method ${methodName} not found on HealthStatusBar`);
          }
        } catch (error) {
          console.error(`[Extension] ✗ Error showing ${type} status bar item:`, error);
        }
      }
    }
  } catch (error) {
    console.error('[Extension] Error initializing HealthService:', error);
  }

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
      console.log('[Backend] Running in limited functionality mode - backend service not available');
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
  
  // 1. Show status command - using status bar instead of popup
  disposables.push(vscode.commands.registerCommand('devtimetracker.showStatus', () => {
    if (!statusBarManager) return;
    
    const sessionTime = statusBarManager.getSessionTime();
    const todayTime = statusBarManager.getTodayTime();
    const metrics = MetricsService.getInstance().getMetrics();
    
    // Create a status bar item to show the status
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
    statusBarItem.text = `$(info) Dev Time Tracker`;
    
    // Build the tooltip with all the information
    let tooltip = new vscode.MarkdownString();
    tooltip.appendMarkdown('### Dev Time Tracker Status\n\n');
    tooltip.appendMarkdown(`**Current Session:** ${sessionTime}\n`);
    tooltip.appendMarkdown(`**Today's Total:** ${todayTime}\n\n`);
    
    if (metrics.code) {
      tooltip.appendMarkdown('**Code Metrics**\n');
      tooltip.appendMarkdown(`- Lines: +${metrics.code.lines.added}/-${metrics.code.lines.removed}\n`);
      tooltip.appendMarkdown(`- Files: ${Object.keys(metrics.code.fileTypes).length} types\n\n`);
    }
    
    if (metrics.project?.currentProject) {
      tooltip.appendMarkdown(`**Current Project:** ${metrics.project.currentProject}\n`);
    }
    
    statusBarItem.tooltip = tooltip;
    statusBarItem.show();
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
      statusBarItem.dispose();
    }, 5000);
  }));
  
  // 2. Toggle Pomodoro command
  disposables.push(vscode.commands.registerCommand('devtimetracker.togglePomodoro', () => {
    statusBarManager?.togglePomodoro();
  }));
  
  // 3. Add custom reminder command
  disposables.push(vscode.commands.registerCommand('devtimetracker.addCustomReminder', async () => {
    const customReminderService = CustomReminderService.getInstance(ctx);
    if (!customReminderService) {
      const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
      statusBarItem.text = '$(error) Reminder service not available';
      statusBarItem.show();
      setTimeout(() => statusBarItem.dispose(), 5000);
      return;
    }
    
    // Show status bar message instead of popup
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
    statusBarItem.text = '$(error) Reminder creation not available';
    statusBarItem.tooltip = 'This feature requires popup dialogs which are disabled in this version.';
    statusBarItem.show();
    
    // Auto-hide after 5 seconds
    setTimeout(() => statusBarItem.dispose(), 5000);
    return;
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
