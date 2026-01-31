import * as vscode from 'vscode';
import { BackendService } from './BackendService';
import { ICustomReminder } from '../models/CustomReminder';

export interface SyncStatus {
  lastSync: number;
  settingsSynced: boolean;
  remindersSynced: boolean;
  errors: string[];
}

export class SettingsSyncService {
  private static instance: SettingsSyncService | null = null;
  private context: vscode.ExtensionContext;
  private backendService: BackendService | null;
  private syncInProgress = false;
  private lastSyncTime: number = 0;
  private readonly SYNC_INTERVAL = 5 * 60 * 1000; // 5 minutes - reduced polling frequency
  private syncTimer: NodeJS.Timeout | null = null;
  private isPullingFromBackend = false; // Flag to prevent push-loop

  private constructor(context: vscode.ExtensionContext, backendService: BackendService | null) {
    this.context = context;
    this.backendService = backendService;
    this.lastSyncTime = context.globalState.get('lastSettingsSync', 0);
  }

  public static getInstance(context?: vscode.ExtensionContext, backendService?: BackendService | null): SettingsSyncService {
    if (!SettingsSyncService.instance) {
      if (!context) {
        throw new Error('SettingsSyncService must be initialized with a context first');
      }
      SettingsSyncService.instance = new SettingsSyncService(context, backendService || null);
    }
    return SettingsSyncService.instance;
  }

  /**
   * Initialize the sync service and perform initial sync
   */
  public async initialize(): Promise<void> {
    if (!this.backendService) {
      return;
    }

    // Clean up any invalid settings before syncing
    await this.cleanInvalidSettings();

    // Perform initial sync on startup
    await this.performFullSync();

    // Listen for configuration changes to push to backend
    this.setupConfigurationWatcher();
  }

  /**
   * Clean up invalid settings
   */
  private async cleanInvalidSettings(): Promise<void> {
    const config = vscode.workspace.getConfiguration('devtimetracker');
    const invalidSettings: string[] = [];

    // List of all known settings with their expected types (using ACTUAL VS Code setting names)
    const knownSettings = {
      // Tracking settings
      'tracking.idleTimeout': 'number',
      'tracking.autoStart': 'boolean',
      'tracking.enableDiffCapture': 'boolean',
      'tracking.enableTerminalTracking': 'boolean',

      // Health settings
      'health.breakReminderEnabled': 'boolean',
      'health.breakReminderInterval': 'number',
      'health.breakSnoozeDuration': 'number',
      'health.breakNotificationType': 'string',
      'health.breakEnableSound': 'boolean',
      'health.postureReminderEnabled': 'boolean',
      'health.postureReminderInterval': 'number',
      'health.postureSnoozeDuration': 'number',
      'health.postureNotificationType': 'string',
      'health.postureEnableSound': 'boolean',
      'health.eyeStrainReminderEnabled': 'boolean',
      'health.eyeStrainReminderInterval': 'number',
      'health.eyeStrainSnoozeDuration': 'number',
      'health.eyeStrainNotificationType': 'string',
      'health.eyeStrainEnableSound': 'boolean',
      'health.enable202020Rule': 'boolean',
      'health.enablePostureReminder': 'boolean',
      'health.enableBreakReminder': 'boolean',
      'health.reminderStyle': 'string',
      'health.breakInterval': 'number',
      'health.postureInterval': 'number',
      'health.eyeStrainInterval': 'number',

      // Pomodoro settings
      'pomodoro.workDuration': 'number',
      'pomodoro.shortBreakDuration': 'number',
      'pomodoro.longBreakDuration': 'number',
      'pomodoro.sessionsBeforeLongBreak': 'number',
      'pomodoro.autoStartNextSession': 'boolean',
      'pomodoro.breakDuration': 'number',
      'pomodoro.longBreakAfter': 'number',
      'pomodoro.autoStartBreaks': 'boolean',

      // Metrics settings
      'metrics.enabled': 'boolean',
      'metrics.syncInterval': 'number'
    };

    // First pass: identify all invalid settings
    for (const [key, expectedType] of Object.entries(knownSettings)) {
      const value = config.get(key);
      if (value === undefined) continue;

      const actualType = typeof value;
      let isInvalid = false;

      if (expectedType === 'number' && (actualType !== 'number' || isNaN(value as number) || !isFinite(value as number))) {
        isInvalid = true;
      } else if (expectedType === 'boolean' && actualType !== 'boolean') {
        isInvalid = true;
      } else if (expectedType === 'string' && actualType !== 'string') {
        isInvalid = true;
      }

      if (isInvalid) {
        invalidSettings.push(key);
      }
    }

    // Second pass: batch reset invalid settings
    if (invalidSettings.length > 0) {
      this.isPullingFromBackend = true; // Prevent push-loop
      for (const key of invalidSettings) {
        await config.update(key, undefined, vscode.ConfigurationTarget.Global);
      }
      this.isPullingFromBackend = false;

      vscode.window.showInformationMessage(`✓ Cleaned ${invalidSettings.length} invalid setting${invalidSettings.length > 1 ? 's' : ''}. Defaults will be used.`);
    }
  }  /**
   * Perform a full bidirectional sync
   */
  public async performFullSync(): Promise<SyncStatus> {
    if (this.syncInProgress) {
      return this.getLastSyncStatus();
    }

    this.syncInProgress = true;
    const status: SyncStatus = {
      lastSync: Date.now(),
      settingsSynced: false,
      remindersSynced: false,
      errors: []
    };

    try {
      // Step 1: Pull settings from backend
      await this.pullSettingsFromBackend(status);

      // Step 2: Pull custom reminders from backend
      await this.pullRemindersFromBackend(status);

      // Step 3: Push local settings to backend (if modified)
      await this.pushSettingsToBackend(status);

      // Step 4: Sync custom reminders bidirectionally
      await this.syncRemindersWithBackend(status);

      this.lastSyncTime = status.lastSync;
      await this.context.globalState.update('lastSettingsSync', this.lastSyncTime);
    } catch (error) {
      const errorMsg = `Sync failed: ${error}`;
      status.errors.push(errorMsg);
    } finally {
      this.syncInProgress = false;
    }

    return status;
  }

  /**
   * Pull settings from backend and apply locally
   */
  private async pullSettingsFromBackend(status: SyncStatus): Promise<void> {
    if (!this.backendService) return;

    try {
      const backendSettings = await this.backendService.getExtensionSettings();

      if (backendSettings && backendSettings.length > 0) {
        this.isPullingFromBackend = true; // Set flag to prevent push-loop
        const config = vscode.workspace.getConfiguration('devtimetracker');
        let updatedCount = 0;

        for (const setting of backendSettings) {
          if (setting.key === 'customReminders') continue;

          const currentValue = config.get(setting.key);
          let backendValue = this.validateAndConvertSettingValue(setting.key, setting.value);

          if (backendValue === null) continue;

          // Only update if backend value is different
          if (JSON.stringify(currentValue) !== JSON.stringify(backendValue)) {
            await config.update(setting.key, backendValue, vscode.ConfigurationTarget.Global);
            updatedCount++;
          }
        }

        this.isPullingFromBackend = false; // Reset flag

        if (updatedCount > 0) {
          vscode.window.showInformationMessage(`✓ ${updatedCount} setting${updatedCount > 1 ? 's' : ''} updated from backend`);
        }

        status.settingsSynced = true;
      }
    } catch (error) {
      this.isPullingFromBackend = false; // Reset flag on error
      status.errors.push(`Failed to pull settings: ${error}`);
    }
  }

  /**
   * Validate and convert a setting value to the correct type
   * Returns null if the value is invalid
   */
  private validateAndConvertSettingValue(key: string, value: any): any {
    // Number settings (using ACTUAL VS Code setting names)
    const numberSettings = [
      'tracking.idleTimeout',
      'health.breakInterval',
      'health.breakReminderInterval',
      'health.breakSnoozeDuration',
      'health.postureInterval',
      'health.postureReminderInterval',
      'health.postureSnoozeDuration',
      'health.eyeStrainInterval',
      'health.eyeStrainReminderInterval',
      'health.eyeStrainSnoozeDuration',
      'pomodoro.workDuration',
      'pomodoro.breakDuration',
      'pomodoro.shortBreakDuration',
      'pomodoro.longBreakDuration',
      'pomodoro.longBreakAfter',
      'pomodoro.sessionsBeforeLongBreak',
      'metrics.syncInterval'
    ];

    // Boolean settings (using ACTUAL VS Code setting names)
    const booleanSettings = [
      'tracking.autoStart',
      'tracking.enableDiffCapture',
      'tracking.enableTerminalTracking',
      'health.enable202020Rule',
      'health.enablePostureReminder',
      'health.enableBreakReminder',
      'health.breakReminderEnabled',
      'health.breakEnableSound',
      'health.postureReminderEnabled',
      'health.postureEnableSound',
      'health.eyeStrainReminderEnabled',
      'health.eyeStrainEnableSound',
      'pomodoro.autoStartBreaks',
      'pomodoro.autoStartNextSession',
      'metrics.enabled'
    ];

    // String settings
    const stringSettings = [
      'health.reminderStyle',
      'health.breakNotificationType',
      'health.postureNotificationType',
      'health.eyeStrainNotificationType',
      'timezone'
    ];

    if (numberSettings.includes(key)) {
      const num = Number(value);
      if (isNaN(num) || !isFinite(num)) {
        return null;
      }
      return num;
    } else if (booleanSettings.includes(key)) {
      if (typeof value === 'boolean') return value;
      if (value === 'true' || value === true) return true;
      if (value === 'false' || value === false) return false;
      return null;
    } else if (stringSettings.includes(key)) {
      return String(value);
    }

    // Unknown setting, return as-is
    return value;
  }

  /**
   * Push local settings to backend
   */
  private async pushSettingsToBackend(status: SyncStatus): Promise<void> {
    if (!this.backendService) return;

    try {
      const config = vscode.workspace.getConfiguration('devtimetracker');

      // List of settings to sync (exclude sensitive data)
      const settingsToSync = [
        'tracking.idleTimeout',
        'tracking.enableDiffCapture',
        'tracking.enableTerminalTracking',
        'health.enable202020Rule',
        'health.enablePostureReminder',
        'health.enableBreakReminder',
        'health.breakInterval',
        'health.reminderStyle',
        'pomodoro.workDuration',
        'pomodoro.breakDuration',
        'pomodoro.longBreakDuration',
        'pomodoro.autoStartBreaks',
        'timezone'
      ];

      let successCount = 0;
      let failCount = 0;

      for (const key of settingsToSync) {
        try {
          const value = config.get(key);
          if (value !== undefined) {
            await this.backendService.updateExtensionSetting(key, value);
            successCount++;
          }
        } catch (error) {
          failCount++;
        }
      }

      if (failCount === 0) {
        status.settingsSynced = true;
      }
    } catch (error) {
      status.errors.push(`Failed to push settings: ${error}`);
    }
  }

  /**
   * Pull custom reminders from backend
   */
  private async pullRemindersFromBackend(status: SyncStatus): Promise<void> {
    if (!this.backendService) return;

    try {
      const response = await this.backendService.getCustomReminders();

      if (response && response.data) {
        this.isPullingFromBackend = true;
        const config = vscode.workspace.getConfiguration('devtimetracker');
        const backendReminders = response.data;

        await config.update('customReminders', backendReminders, vscode.ConfigurationTarget.Global);
        this.isPullingFromBackend = false;

        status.remindersSynced = true;
      }
    } catch (error) {
      this.isPullingFromBackend = false;
      status.errors.push(`Failed to pull reminders: ${error}`);
    }
  }

  /**
   * Sync custom reminders bidirectionally with backend
   */
  private async syncRemindersWithBackend(status: SyncStatus): Promise<void> {
    if (!this.backendService) return;

    try {
      const config = vscode.workspace.getConfiguration('devtimetracker');
      const localReminders = config.get<ICustomReminder[]>('customReminders', []);

      // Send local reminders to backend for merge
      const response = await this.backendService.syncCustomReminders(localReminders, this.lastSyncTime);

      if (response && response.data) {
        // Update local config with merged reminders from backend
        await config.update('customReminders', response.data, vscode.ConfigurationTarget.Global);

        status.remindersSynced = true;
      }
    } catch (error) {
      status.errors.push(`Failed to sync reminders: ${error}`);
    }
  }

  /**
   * Watch for local configuration changes and push to backend
   */
  private setupConfigurationWatcher(): void {
    this.context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration(async (e) => {
        if (!this.backendService) return;

        // Skip if we're pulling from backend (prevents push-loop)
        if (this.isPullingFromBackend) return;

        // Debounce config changes
        if (e.affectsConfiguration('devtimetracker')) {
          setTimeout(async () => {
            try {
              await this.pushSettingsToBackend({
                lastSync: Date.now(),
                settingsSynced: false,
                remindersSynced: false,
                errors: []
              });
            } catch (error) {
              // Silently fail - errors are tracked in status
            }
          }, 2000); // 2 second debounce
        }
      })
    );
  }

  /**
   * Start periodic sync
   */
  private startPeriodicSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
    }

    this.syncTimer = setInterval(async () => {
      await this.performFullSync();
    }, this.SYNC_INTERVAL);
  }

  /**
   * Get last sync status
   */
  private getLastSyncStatus(): SyncStatus {
    return {
      lastSync: this.lastSyncTime,
      settingsSynced: false,
      remindersSynced: false,
      errors: ['Sync already in progress']
    };
  }

  /**
   * Force sync now
   */
  public async forceSyncNow(): Promise<SyncStatus> {
    return await this.performFullSync();
  }

  /**
   * Dispose resources
   */
  public dispose(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }

  /**
   * Reset singleton for testing
   */
  public static resetInstance(): void {
    if (SettingsSyncService.instance) {
      SettingsSyncService.instance.dispose();
      SettingsSyncService.instance = null;
    }
  }
}
