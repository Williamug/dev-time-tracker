import * as vscode from 'vscode';
import { EventBuffer } from './buffer';
import { EventListener } from './eventListener';
import { StatusBarManager } from './statusBarManager';
import { MetricsService } from './services/MetricsService';
import { GitService } from './services/GitService';
import { HealthService } from './services/HealthService';
import { BackendService } from './services/BackendService';
import { CustomReminderService } from './services/CustomReminderService';
import { SettingsSyncService } from './services/SettingsSyncService';
import { DiffService } from './services/DiffService';
import { FileSessionTracker } from './services/FileSessionTracker';
import { TerminalTracker } from './services/TerminalTracker';
import { registerCustomReminderCommands } from './commands/manageCustomReminders';
import { ICustomReminder } from './models/CustomReminder';

let statusBarManager: StatusBarManager | null = null;
let diffService: DiffService | null = null;
let eventBuffer: EventBuffer | null = null;
let fileSessionTracker: FileSessionTracker | null = null;
let terminalTracker: TerminalTracker | null = null;
let settingsSyncService: SettingsSyncService | null = null;

export async function activate(ctx: vscode.ExtensionContext) {

  // Log available commands for debugging
  const availableCommands = await vscode.commands.getCommands(true);

  const cfg = vscode.workspace.getConfiguration('devtimetracker');
  const apiUrl = cfg.get<string>('apiUrl');
  const apiToken = cfg.get<string>('apiToken');

  // Initialize services with backend support
  let backendService: BackendService | null = null;
  let metricsService: MetricsService | null = null;
  let gitService: GitService | null = null;
  let healthService: HealthService | null = null;
  let customReminderService: CustomReminderService | null = null;

  // Register health reminder commands FIRST (before HealthService creates status bar items)

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

  // Initialize backend service FIRST if configured (so other services can use it)
  if (apiUrl) {
    try {
      backendService = BackendService.getInstance();
      const initialized = await backendService.initialize();

      if (initialized) {
        vscode.window.showInformationMessage(`✅ Connected to backend: ${apiUrl}`);
      }
    } catch (error) {
      vscode.window.showWarningMessage('❌ Failed to connect to backend. Please verify your API URL and token.');
    }
  } else {
    vscode.window.showWarningMessage('Dev Time Tracker: No API URL configured. Backend features disabled.');
  }

  // Initialize HealthService (it may use backend if available)
  try {
    healthService = HealthService.getInstance(backendService || undefined, ctx);

    // Verify HealthStatusBar instance
    if (!healthService.healthStatusBar) {

    } else {

      // Try to force show status bar items
      const types = ['break', 'posture', 'eyeStrain'] as const;
      for (const type of types) {
        try {

          // Use type assertion to access the methods
          const statusBar = healthService.healthStatusBar as any;
          const methodName = `show${type.charAt(0).toUpperCase() + type.slice(1)}Reminder` as const;

          if (typeof statusBar[methodName] === 'function') {
            statusBar[methodName](1);

          } else {

          }
        } catch (error) {

        }
      }
    }
  } catch (error) {
  }

  // Initialize other services with backend (if available)
  if (backendService) {

    // Register configuration change listener
    let configChangeTimeout: NodeJS.Timeout | null = null;
    vscode.workspace.onDidChangeConfiguration(async (e) => {
      if (e.affectsConfiguration('devtimetracker.apiUrl') || e.affectsConfiguration('devtimetracker.apiToken')) {
        // Only reinitialize if API connection settings changed

        await backendService?.initialize();
      } else if (e.affectsConfiguration('devtimetracker.tracking.enableDiffCapture')) {
        // Handle diff tracking toggle
        const cfg = vscode.workspace.getConfiguration('devtimetracker');
        const enableDiffCapture = cfg.get<boolean>('tracking.enableDiffCapture', true);

        if (enableDiffCapture) {
          // Enable diff tracking
          if (!diffService) {
            diffService = new DiffService();
            diffService.start();
            eventBuffer?.setDiffService(diffService);

          }
        } else {
          // Disable diff tracking
          if (diffService) {
            diffService.dispose();
            diffService = null;
            eventBuffer?.setDiffService(null);

          }
        }
      } else if (e.affectsConfiguration('devtimetracker')) {
        // Push settings TO backend after a short delay (debounce)
        if (configChangeTimeout) {
          clearTimeout(configChangeTimeout);
        }
        configChangeTimeout = setTimeout(async () => {

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

          } catch (error) {

          }
        }, 1000); // 1 second debounce
      }
    });

    // Initialize services with backend support
    metricsService = MetricsService.getInstance(backendService);
    gitService = GitService.getInstance(backendService);

    // Initialize settings sync service
    settingsSyncService = SettingsSyncService.getInstance(ctx, backendService);
    await settingsSyncService.initialize();

    // Initialize custom reminders with metrics integration
    if (metricsService) {
      customReminderService = CustomReminderService.getInstance(ctx, metricsService);
    }
  } else {
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

  // Start the status bar session (this triggers the update interval)
  if (statusBarManager) {
    statusBarManager.updateActivityStatus(false); // Start as idle, FileSessionTracker will update
  }

  // Generate a session ID for this extension instance
  const sessionId = `vscode-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Initialize diff service (conditionally based on settings)
  const enableDiffCapture = cfg.get<boolean>('tracking.enableDiffCapture', true);
  if (enableDiffCapture) {
    diffService = new DiffService();
    diffService.start();
  } else {

  }

  // Initialize event buffer and FileSessionTracker with context for persistence
  eventBuffer = new EventBuffer(apiUrl || '', apiToken || '', sessionId, diffService, ctx);
  fileSessionTracker = new FileSessionTracker(eventBuffer, diffService);
  fileSessionTracker.start();

  // Connect FileSessionTracker to StatusBarManager for instant idle detection
  if (statusBarManager && fileSessionTracker) {
    statusBarManager.setFileSessionTracker(fileSessionTracker);
  }

  // Initialize terminal tracker (optional, based on settings)
  const enableTerminalTracking = cfg.get<boolean>('tracking.enableTerminalTracking', false);
  if (enableTerminalTracking) {
    terminalTracker = new TerminalTracker(eventBuffer, fileSessionTracker);
    terminalTracker.start();
  }

  // Initialize event listener with FileSessionTracker
  const listener = new EventListener(ctx, eventBuffer, sessionId, fileSessionTracker);
  listener.start();

  // Start the event buffer
  eventBuffer.start();

  // Activity tracking is handled by FileSessionTracker through EventListener
  // No need for separate activity event listeners

  // Register custom reminder commands early
  registerCustomReminderCommands(ctx);

  // Register other commands
  const disposables: vscode.Disposable[] = [];

  // 2. Toggle Pomodoro command
  disposables.push(vscode.commands.registerCommand('devtimetracker.togglePomodoro', () => {
    statusBarManager?.togglePomodoro();
  }));

  // 2b. Test notifications command (for debugging)
  disposables.push(vscode.commands.registerCommand('devtimetracker.testNotifications', async () => {
    vscode.window.showInformationMessage('Testing notifications - this should appear in bottom-right corner', 'OK');

    // Also test backend connection
    if (backendService) {
      try {
        await backendService.sendEvent('test', { message: 'Test from extension' });
        vscode.window.showInformationMessage('✓ Backend connection working!');
      } catch (error) {
        // Show safe error message
        vscode.window.showErrorMessage('✗ Backend connection failed. Please check your API settings.');
      }
    } else {
      vscode.window.showWarningMessage('Backend service not initialized');
    }
  }));

  // Health reminder commands already registered at the top of activate()

  // 2c. Sync settings with backend command
  disposables.push(vscode.commands.registerCommand('devtimetracker.syncSettings', async () => {
    if (!settingsSyncService) {
      vscode.window.showWarningMessage('Settings sync service not available (backend not configured)');
      return;
    }

    vscode.window.showInformationMessage('Syncing settings with backend...');
    const status = await settingsSyncService.forceSyncNow();

    if (status.errors.length > 0) {
      vscode.window.showErrorMessage(`Sync completed with errors: ${status.errors.join(', ')}`);
    } else {
      vscode.window.showInformationMessage(
        `✓ Settings synced successfully!\nSettings: ${status.settingsSynced ? '✓' : '✗'} | Reminders: ${status.remindersSynced ? '✓' : '✗'}`
      );
    }
  }));

  // 2c2. Reset invalid settings command
  disposables.push(vscode.commands.registerCommand('devtimetracker.resetInvalidSettings', async () => {
    const config = vscode.workspace.getConfiguration('devtimetracker');

    // List of all numeric settings with their defaults
    const numericSettings = [
      { key: 'pomodoro.workDuration', default: 25 },
      { key: 'pomodoro.shortBreakDuration', default: 5 },
      { key: 'pomodoro.longBreakDuration', default: 15 },
      { key: 'pomodoro.sessionsBeforeLongBreak', default: 4 },
      { key: 'health.breakReminderInterval', default: 3600 },
      { key: 'health.postureReminderInterval', default: 1800 },
      { key: 'health.eyeStrainReminderInterval', default: 1200 },
      { key: 'health.breakSnoozeDuration', default: 900 },
      { key: 'health.postureSnoozeDuration', default: 900 },
      { key: 'health.eyeStrainSnoozeDuration', default: 600 },
      { key: 'tracking.idleTimeout', default: 300 },
      { key: 'metrics.syncInterval', default: 60 }
    ];

    const booleanSettings = [
      { key: 'pomodoro.autoStartNextSession', default: false },
      { key: 'health.breakReminderEnabled', default: true },
      { key: 'health.postureReminderEnabled', default: true },
      { key: 'health.eyeStrainReminderEnabled', default: true },
      { key: 'health.enable202020Rule', default: true },
      { key: 'health.enablePostureReminder', default: true },
      { key: 'health.enableBreakReminder', default: true },
      { key: 'health.breakEnableSound', default: false },
      { key: 'health.postureEnableSound', default: false },
      { key: 'health.eyeStrainEnableSound', default: false },
      { key: 'tracking.enableDiffCapture', default: true },
      { key: 'tracking.enableTerminalTracking', default: false },
      { key: 'metrics.enabled', default: true }
    ];

    let resetCount = 0;

    // Reset numeric settings if they're not valid numbers
    for (const setting of numericSettings) {
      const value = config.get(setting.key);
      if (typeof value !== 'number' || isNaN(value) || !isFinite(value)) {
        await config.update(setting.key, setting.default, vscode.ConfigurationTarget.Global);
        resetCount++;
      }
    }

    // Reset boolean settings if they're not valid booleans
    for (const setting of booleanSettings) {
      const value = config.get(setting.key);
      if (typeof value !== 'boolean') {
        await config.update(setting.key, setting.default, vscode.ConfigurationTarget.Global);
        resetCount++;
      }
    }

    if (resetCount > 0) {
      vscode.window.showInformationMessage(
        `✓ Reset ${resetCount} invalid setting${resetCount > 1 ? 's' : ''} to defaults. Please reload the window.`,
        'Reload Window'
      ).then(selection => {
        if (selection === 'Reload Window') {
          vscode.commands.executeCommand('workbench.action.reloadWindow');
        }
      });
    } else {
      vscode.window.showInformationMessage('All settings are valid!');
    }
  }));

  // 2d. Toggle diff capture command
  disposables.push(vscode.commands.registerCommand('devtimetracker.toggleDiffCapture', async () => {
    const cfg = vscode.workspace.getConfiguration('devtimetracker');
    const currentValue = cfg.get<boolean>('tracking.enableDiffCapture', true);
    const newValue = !currentValue;

    await cfg.update('tracking.enableDiffCapture', newValue, vscode.ConfigurationTarget.Global);

    // Restart or stop DiffService based on new value
    if (newValue) {
      // Enable diff tracking
      if (!diffService) {
        diffService = new DiffService();
        diffService.start();
        eventBuffer?.setDiffService(diffService);
      }
      vscode.window.showInformationMessage('✓ Code diff tracking enabled');
    } else {
      // Disable diff tracking
      if (diffService) {
        diffService.dispose();
        diffService = null;
        eventBuffer?.setDiffService(null);
      }
      vscode.window.showInformationMessage('Code diff tracking disabled (line counts only)');
    }
  }));

  // Register all disposables with the extension context
  disposables.forEach(disposable => ctx.subscriptions.push(disposable));

  // Log successful activation

  // Return the public API if needed
  return {
    // Add any public API methods here
  };
}

export async function deactivate() {

  // Dispose of services
  MetricsService.getInstance().dispose();
  HealthService.getInstance().dispose();
  CustomReminderService.getInstance().dispose();

  if (settingsSyncService) {
    settingsSyncService.dispose();
    settingsSyncService = null;
  }

  if (diffService) {
    diffService.dispose();
    diffService = null;
  }

  // Stop terminal tracker
  if (terminalTracker) {
    terminalTracker.stop();
    terminalTracker = null;
  }

  // End all active file sessions
  if (fileSessionTracker) {
    fileSessionTracker.endAllSessions();
    fileSessionTracker = null;
  }
}
