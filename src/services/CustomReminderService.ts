import * as vscode from 'vscode';
import { CustomReminder, ICustomReminder, NotificationType, ICustomReminderAction, ICustomReminderConditions } from '../models/CustomReminder';
import { NotificationManager } from '../utils/NotificationManager';
import { IMetricsProvider, DefaultMetricsProvider } from '../models/IMetricsProvider';

const STORAGE_KEY = 'devtimetracker.customReminders';

interface ReminderCheckResult {
  shouldTrigger: boolean;
  reason?: string;
}

export class CustomReminderService {
  private static instance: CustomReminderService | null = null;
  private reminders: Map<string, CustomReminder> = new Map();
  private notificationManager: NotificationManager;
  private checkInterval: NodeJS.Timeout | null = null;
  private static readonly CHECK_INTERVAL = 30 * 1000; // 30 seconds
  private context: vscode.ExtensionContext;
  private isInitialized = false;
  private pendingSave: NodeJS.Timeout | null = null;
  private static readonly SAVE_DEBOUNCE = 1000; // 1 second debounce for saves
  private metricsProvider: IMetricsProvider;

  /**
   * Gets the current typing statistics from the metrics provider
   */
  public getTypingStats() {
    return this.metricsProvider.getTypingStats();
  }

  /**
   * Gets the duration of the current coding session in seconds
   */
  public getCurrentSessionDuration(): number {
    return this.metricsProvider.getCurrentSessionDuration();
  }

  /**
   * Gets the language of the currently active document
   */
  public getActiveDocumentLanguage(): string | undefined {
    return this.metricsProvider.getActiveDocumentLanguage();
  }

  private constructor(context: vscode.ExtensionContext, metricsProvider?: IMetricsProvider) {
    this.context = context;
    this.metricsProvider = metricsProvider || new DefaultMetricsProvider();
    this.notificationManager = NotificationManager.getInstance();
    this.initialize();
  }

  public static getInstance(context?: vscode.ExtensionContext, metricsProvider?: IMetricsProvider): CustomReminderService {
    if (!CustomReminderService.instance) {
      if (!context) {
        throw new Error('CustomReminderService must be initialized with a context first');
      }
      CustomReminderService.instance = new CustomReminderService(context, metricsProvider);
    }
    return CustomReminderService.instance;
  }

  private async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    try {
      await this.loadReminders();
      this.setupEventListeners();
      this.startChecking();
      this.isInitialized = true;
      console.log('[CustomReminderService] Initialized successfully');
    } catch (error) {
      console.error('[CustomReminderService] Initialization failed:', error);
      throw error;
    }
  }

  private async loadReminders(): Promise<void> {
    try {
      const savedReminders = this.context.globalState.get<ICustomReminder[]>(STORAGE_KEY, []);
      this.reminders = new Map(
        savedReminders.map(reminder => [reminder.id, CustomReminder.fromJSON(reminder)])
      );
      console.log(`[CustomReminderService] Loaded ${savedReminders.length} reminders`);
    } catch (error) {
      console.error('[CustomReminderService] Failed to load reminders:', error);
      this.reminders = new Map(); // Reset to empty map on error
    }
  }

  private async saveReminders(): Promise<void> {
    // Debounce save operations to prevent rapid successive saves
    if (this.pendingSave) {
      clearTimeout(this.pendingSave);
    }

    return new Promise<void>((resolve, reject) => {
      this.pendingSave = setTimeout(async () => {
        try {
          const reminders = Array.from(this.reminders.values()).map(r => r.toJSON());
          await this.context.globalState.update(STORAGE_KEY, reminders);
          console.log(`[CustomReminderService] Saved ${reminders.length} reminders`);
          resolve();
        } catch (error) {
          console.error('[CustomReminderService] Failed to save reminders:', error);
          reject(error);
        } finally {
          this.pendingSave = null;
        }
      }, CustomReminderService.SAVE_DEBOUNCE);
    });
  }

  private setupEventListeners(): void {
    // Listen for document changes to track typing activity
    this.context.subscriptions.push(
      vscode.workspace.onDidChangeTextDocument(event => {
        if (event.contentChanges.length > 0) {
          this.checkTypingSpeed(event);
        }
      })
    );

    // Save reminders when the extension is deactivated
    this.context.subscriptions.push({
      dispose: async () => {
        try {
          await this.saveReminders();
        } catch (error) {
          console.error('[CustomReminderService] Error during cleanup:', error);
        }
      }
    });

    // Update active document language when editor changes
    this.context.subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor(editor => {
        // Active document language is now handled by the metrics provider
      })
    );
  }

  private startChecking(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
    
    this.checkInterval = setInterval(async () => {
      try {
        await this.checkReminders();
      } catch (error) {
        console.error('[CustomReminderService] Error checking reminders:', error);
      }
    }, CustomReminderService.CHECK_INTERVAL);
  }

  private async checkTypingSpeed(event: vscode.TextDocumentChangeEvent): Promise<void> {
    // Typing speed is now handled by the MetricsService
    // This method is kept for backward compatibility
  }

  private async checkReminders(): Promise<void> {
    const typingStats = this.metricsProvider.getTypingStats();
    const sessionDuration = this.metricsProvider.getCurrentSessionDuration();
    const language = this.metricsProvider.getActiveDocumentLanguage();
    
    for (const [id, reminder] of this.reminders.entries()) {
      if (reminder.shouldTrigger(typingStats, language, sessionDuration)) {
        await this.triggerReminder(reminder);
      }
    }
  }

  private async triggerReminder(reminder: CustomReminder) {
    // Update last triggered time
    reminder.lastTriggered = Date.now();
    
    // Show notification (use 'info' if notificationType is 'none')
    const notificationType = reminder.notificationType === 'none' ? 'info' : reminder.notificationType;
    const result = await this.notificationManager.showNotificationCard({
      title: reminder.title,
      message: reminder.message,
      type: notificationType,
      sound: reminder.soundEnabled ? 'alert' : undefined,
      actions: reminder.actions
    });

    // Handle the selected action
    if (result === 'snooze') {
      // Default snooze for 30 minutes
      reminder.lastTriggered = Date.now() + (30 * 60 * 1000);
      vscode.window.showInformationMessage(`"${reminder.title}" snoozed for 30 minutes`);
    }

    // Save the updated reminder
    await this.saveReminders();
  }

  // Public API
  public async addReminder(reminder: Partial<ICustomReminder>): Promise<CustomReminder> {
    const newReminder = new CustomReminder(reminder);
    this.reminders.set(newReminder.id, newReminder);
    await this.saveReminders();
    return newReminder;
  }

  public getReminder(id: string): CustomReminder | undefined {
    return this.reminders.get(id);
  }

  public getAllReminders(): CustomReminder[] {
    return Array.from(this.reminders.values());
  }

  public async updateReminder(id: string, updates: Partial<ICustomReminder>): Promise<boolean> {
    const reminder = this.reminders.get(id);
    if (!reminder) return false;

    Object.assign(reminder, updates);
    await this.saveReminders();
    return true;
  }

  public async deleteReminder(id: string): Promise<boolean> {
    const deleted = this.reminders.delete(id);
    if (deleted) {
      await this.saveReminders();
    }
    return deleted;
  }

  public updateTypingStats(stats: { speed: number; accuracy: number }) {
    // Stats are now managed by the MetricsService
    // This method is kept for backward compatibility
  }

  public dispose(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  /**
   * Resets the singleton instance for testing purposes
   * @internal
   */
  public static resetInstance(): void {
    if (CustomReminderService.instance) {
      CustomReminderService.instance.dispose();
      CustomReminderService.instance = null;
    }
  }
}
