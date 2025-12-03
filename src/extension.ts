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
const INACTIVITY_THRESHOLD = 300000; // 5 minutes (production)
let activityCheckInterval: NodeJS.Timeout | null = null;
let statusBarManager: StatusBarManager | null = null;

// Update activity status based on user interaction
function updateActivityStatus() {
  if (!statusBarManager) return;

  const now = Date.now();
  const isActive = now - lastActivityTime < INACTIVITY_THRESHOLD;
  console.log(`[Activity] ${isActive ? 'Active' : 'Idle'} (Last activity: ${new Date(lastActivityTime).toLocaleTimeString()}, ${Math.floor((now - lastActivityTime) / 1000)}s ago)`);
  statusBarManager.updateActivityStatus(isActive);
}

// Track user activity
function trackUserActivity(reason: string) {
  const oldTime = lastActivityTime;
  lastActivityTime = Date.now();
  console.log(`[Activity] Activity detected (${reason})`);
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

  // Register health reminder commands FIRST (before HealthService creates status bar items)
  console.log('[Extension] Registering health reminder commands...');
  ctx.subscriptions.push(
    vscode.commands.registerCommand('devtimetracker.start202020Timer', async () => {
      await healthService?.start202020Timer();
    }),
    vscode.commands.registerCommand('devtimetracker.acknowledgePosture', () => {
      vscode.window.showInformationMessage('✓ Posture checked! Keep sitting up straight.');
    }),
    vscode.commands.registerCommand('devtimetracker.acknowledgeEyeStrain', async () => {
      await healthService?.start202020Timer();
    }),
    vscode.commands.registerCommand('devtimetracker.startBreak', () => {
      vscode.window.showInformationMessage('💪 Taking a break! Stand up, stretch, and rest your eyes.');
    }),
    vscode.commands.registerCommand('devtimetracker.breakReminder', () => {
      // Placeholder for status bar click
    }),
    vscode.commands.registerCommand('devtimetracker.postureReminder', () => {
      // Placeholder for status bar click
    }),
    vscode.commands.registerCommand('devtimetracker.eyeStrainReminder', () => {
      // Placeholder for status bar click
    })
  );
  console.log('[Extension] Health reminder commands registered');

  // Initialize backend service FIRST if configured (so other services can use it)
  console.log('[Extension] Checking backend configuration...', { apiUrl, apiToken: apiToken ? '***' + apiToken.slice(-8) : 'none' });

  if (apiUrl) {
    console.log('[Extension] API URL found, initializing BackendService...');
    try {
      backendService = BackendService.getInstance();
      console.log('[Extension] BackendService instance created, initializing...');
      const initialized = await backendService.initialize();

      if (initialized) {
        console.log('[Backend] ✅ Successfully connected to backend service at', apiUrl);
        vscode.window.showInformationMessage(`✅ Connected to backend: ${apiUrl}`);
      }
    } catch (error) {
      console.error('[Backend] ❌ Error initializing backend service:', error);
      vscode.window.showWarningMessage(`❌ Failed to connect to backend: ${error}`);
    }
  } else {
    console.log('[Extension] ⚠️  No API URL configured - backend service disabled');
    vscode.window.showWarningMessage('Dev Time Tracker: No API URL configured. Backend features disabled.');
  }

  // Initialize HealthService (it may use backend if available)
  console.log('[Extension] ===== STARTING HEALTH SERVICE INITIALIZATION =====');
  try {
    // Initialize HealthService
    console.log('[Extension] Creating HealthService instance...');
    healthService = HealthService.getInstance(backendService || undefined, ctx);
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

  // Initialize other services with backend (if available)
  if (backendService) {
    console.log('[Extension] Initializing services with backend support...');

    // Register configuration change listener
    let configChangeTimeout: NodeJS.Timeout | null = null;
    vscode.workspace.onDidChangeConfiguration(async (e) => {
      if (e.affectsConfiguration('devtimetracker.apiUrl') || e.affectsConfiguration('devtimetracker.apiToken')) {
        // Only reinitialize if API connection settings changed
        console.log('[Backend] API connection settings changed, reinitializing...');
        await backendService?.initialize();
      } else if (e.affectsConfiguration('devtimetracker')) {
        // Push settings TO backend after a short delay (debounce)
        if (configChangeTimeout) {
          clearTimeout(configChangeTimeout);
        }
        configChangeTimeout = setTimeout(async () => {
          console.log('[Backend] Settings changed, pushing to backend...');
          try {
            const config = vscode.workspace.getConfiguration('devtimetracker');
            const settingsKeys = ['pomodoro', 'health', 'metrics'];

            for (const key of settingsKeys) {
              const section = config.get(key);
              if (section && typeof section === 'object') {
                for (const [subKey, value] of Object.entries(section)) {
                  await backendService?.updateExtensionSetting(`${key}.${subKey}`, value);
                }
              }
            }
            console.log('[Backend] Settings pushed successfully');
          } catch (error) {
            console.error('[Backend] Failed to push settings:', error);
          }
        }, 1000); // 1 second debounce
      }
    });

    // Initialize services with backend support
    metricsService = MetricsService.getInstance(backendService);
    gitService = GitService.getInstance(backendService);

    // Initialize custom reminders with metrics integration
    if (metricsService) {
      customReminderService = CustomReminderService.getInstance(ctx, metricsService);
    }
  } else {
    console.log('[Extension] Initializing services WITHOUT backend support...');
    metricsService = MetricsService.getInstance(undefined);
    gitService = GitService.getInstance(undefined);
  }

  // Register showStatus command BEFORE StatusBarManager (so it exists when status bar items are created)
  ctx.subscriptions.push(vscode.commands.registerCommand('devtimetracker.showStatus', () => {
    if (!statusBarManager) {
      vscode.window.showInformationMessage('Dev Time Tracker is not initialized yet');
      return;
    }

    const sessionTime = statusBarManager.getSessionTime();
    const todayTime = statusBarManager.getTodayTime();
    const metrics = MetricsService.getInstance().getMetrics();

    // Build status message
    let message = `Session: ${sessionTime} | Today: ${todayTime}`;

    if (metrics.code) {
      const linesAdded = metrics.code.lines?.added || 0;
      const linesRemoved = metrics.code.lines?.removed || 0;
      const fileTypes = Object.keys(metrics.code.fileTypes || {}).length;
      message += ` | Lines: +${linesAdded}/-${linesRemoved} | Files: ${fileTypes} types`;
    }

    vscode.window.showInformationMessage(message);
  }));

  // Initialize status bar manager as a singleton
  statusBarManager = StatusBarManager.getInstance(ctx);

  // Trigger initial activity to start the session
  if (statusBarManager) {
    statusBarManager.updateActivityStatus(true);
    console.log('[Extension] Initial activity status set to active');

    // Start activity check interval
    activityCheckInterval = setInterval(() => {
      updateActivityStatus();
    }, 1000); // Check every second
    console.log('[Extension] Activity check interval started');
  }

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
    // Editor events - Track typing and content changes
    vscode.window.onDidChangeActiveTextEditor((e) => {
      console.log('[Activity] Active editor changed:', e?.document.uri.fsPath);
      trackUserActivity('editor changed');
    }),

    vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.contentChanges.length > 0) {
        trackUserActivity('document changed');
      }
    }),

    // Selection changes - detect mouse clicks and keyboard navigation
    vscode.window.onDidChangeTextEditorSelection((e) => {
      trackUserActivity('selection changed');
    }),

    // Visible ranges changed - detect scrolling
    vscode.window.onDidChangeTextEditorVisibleRanges((e) => {
      trackUserActivity('scrolling');
    }),

    // Terminal events
    vscode.window.onDidChangeTerminalState(() => {
      trackUserActivity('terminal state changed');
    }),

    vscode.window.onDidOpenTerminal(() => {
      trackUserActivity('terminal opened');
    }),

    vscode.window.onDidCloseTerminal(() => {
      trackUserActivity('terminal closed');
    }),

    // Window events
    vscode.window.onDidChangeWindowState((e) => {
      if (e.focused) {
        trackUserActivity('window focus changed');
      }
    }),

    // Workspace events
    vscode.workspace.onDidOpenTextDocument(() => {
      trackUserActivity('document opened');
    }),

    vscode.workspace.onDidCloseTextDocument(() => {
      trackUserActivity('document closed');
    }),

    vscode.workspace.onDidSaveTextDocument(() => {
      trackUserActivity('document saved');
    }),

    // View column changes - detect panel/sidebar interactions
    vscode.window.onDidChangeTextEditorViewColumn(() => {
      trackUserActivity('view column changed');
    })
  ];

  // Add activity event listeners to subscriptions
  activityEvents.forEach(disposable => ctx.subscriptions.push(disposable));

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

  // Register other commands
  const disposables: vscode.Disposable[] = [];

  // 2. Toggle Pomodoro command
  disposables.push(vscode.commands.registerCommand('devtimetracker.togglePomodoro', () => {
    statusBarManager?.togglePomodoro();
  }));

  // 2b. Test notifications command (for debugging)
  disposables.push(vscode.commands.registerCommand('devtimetracker.testNotifications', async () => {
    vscode.window.showInformationMessage('Testing notifications - this should appear in bottom-right corner', 'OK');
    console.log('[Extension] Test notification sent');

    // Also test backend connection
    if (backendService) {
      try {
        await backendService.sendEvent('test', { message: 'Test from extension' });
        vscode.window.showInformationMessage('✓ Backend connection working!');
      } catch (error) {
        vscode.window.showErrorMessage(`✗ Backend connection failed: ${error}`);
      }
    } else {
      vscode.window.showWarningMessage('Backend service not initialized');
    }
  }));

  // Health reminder commands already registered at the top of activate()

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
  console.log('[Extension] Deactivating Dev Time Tracker');

  // Clear activity check interval
  if (activityCheckInterval) {
    clearInterval(activityCheckInterval);
    activityCheckInterval = null;
  }

  // Dispose of services
  MetricsService.getInstance().dispose();
  HealthService.getInstance().dispose();
  CustomReminderService.getInstance().dispose();

  // End current session
  await SessionManager.endSession();
}
