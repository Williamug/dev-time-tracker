import * as vscode from 'vscode';
import { CustomReminder, ICustomReminder, NotificationType, ICustomReminderAction, ICustomReminderConditions } from '../models/CustomReminder';
import { IMetricsProvider, DefaultMetricsProvider } from '../models/IMetricsProvider';

export class CustomReminderService {
  private static instance: CustomReminderService | null = null;
  private reminders: Map<string, CustomReminder> = new Map();
  private checkInterval: NodeJS.Timeout | null = null;
  private static readonly CHECK_INTERVAL = 30 * 1000; // 30 seconds
  private context: vscode.ExtensionContext;
  private isInitialized = false;

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

  private constructor(
    context: vscode.ExtensionContext,
    private metricsProvider: IMetricsProvider = new DefaultMetricsProvider()
  ) {
    this.context = context;
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
      this.loadRemindersFromConfig();
      this.setupEventListeners();
      this.startChecking();
      this.isInitialized = true;
    } catch (error) {
      throw error;
    }
  }

  private loadRemindersFromConfig(): void {
    try {
      const config = vscode.workspace.getConfiguration('devtimetracker');
      const remindersConfig = config.get<ICustomReminder[]>('customReminders', []);

      this.reminders = new Map(
        remindersConfig.map(reminder => [reminder.id, CustomReminder.fromJSON(reminder)])
      );

    } catch (error) {
      this.reminders = new Map();
    }
  }

  private setupEventListeners(): void {
    // Listen for configuration changes to reload reminders
    this.context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('devtimetracker.customReminders')) {
          this.loadRemindersFromConfig();
        }
      })
    );

    // Listen for document changes to track typing activity
    this.context.subscriptions.push(
      vscode.workspace.onDidChangeTextDocument(event => {
        if (event.contentChanges.length > 0) {
          this.checkTypingSpeed(event);
        }
      })
    );

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
        await this.showReminder(reminder, 'Reminder triggered');
      }
    }
  }

  private async showReminder(reminder: CustomReminder, reason: string): Promise<void> {
    // Show simple toast notification without modal
    vscode.window.showInformationMessage(`${reminder.title}: ${reminder.message}`);

    // Update last triggered time in the config
    const config = vscode.workspace.getConfiguration('devtimetracker');
    const reminders = config.get<ICustomReminder[]>('customReminders', []);
    const reminderIndex = reminders.findIndex(r => r.id === reminder.id);

    if (reminderIndex !== -1) {
      reminders[reminderIndex].lastTriggered = Date.now();
      await config.update('customReminders', reminders, vscode.ConfigurationTarget.Global);
    }

    // Update in memory
    reminder.lastTriggered = Date.now();
  }

  private getNotificationType(type: NotificationType): 'info' | 'warning' | 'error' {
    if (type === 'none' || type === 'info') return 'info';
    if (type === 'warning') return 'warning';
    if (type === 'error') return 'error';
    return 'info';
  }

  private handleAction(reminder: CustomReminder, action: ICustomReminderAction): void {
    // Handle snooze action
    if (action.action.toLowerCase() === 'snooze') {
      // Default snooze for 30 minutes
      reminder.lastTriggered = Date.now() + (30 * 60 * 1000);
    }
    // Add more action types as needed
  }

  // Public API - Note: These methods work with in-memory state
  // The UI should update the VS Code configuration directly
  public async addReminder(reminder: Partial<ICustomReminder>): Promise<CustomReminder> {
    const newReminder = new CustomReminder(reminder);
    this.reminders.set(newReminder.id, newReminder);
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
    return true;
  }

  public async deleteReminder(id: string): Promise<boolean> {
    return this.reminders.delete(id);
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
