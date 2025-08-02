import * as vscode from 'vscode';
import { CustomReminder, ICustomReminder } from '../models/CustomReminder';
import { NotificationManager } from '../utils/NotificationManager';

export class CustomReminderService {
  private static instance: CustomReminderService;
  private reminders: Map<string, CustomReminder> = new Map();
  private timer: NodeJS.Timeout | null = null;
  private context: vscode.ExtensionContext;
  private notificationManager: NotificationManager;
  private typingStats = { speed: 0, accuracy: 100 }; // Will be updated by metrics service
  private activeDocumentLanguage: string | undefined;
  private sessionStartTime: number = Date.now();

  private constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.notificationManager = NotificationManager.getInstance();
    this.loadReminders();
    this.setupEventListeners();
    this.startChecking();
  }

  public static getInstance(context: vscode.ExtensionContext): CustomReminderService {
    if (!CustomReminderService.instance) {
      CustomReminderService.instance = new CustomReminderService(context);
    }
    return CustomReminderService.instance;
  }

  private loadReminders() {
    const savedReminders = this.context.globalState.get<ICustomReminder[]>('customReminders') || [];
    this.reminders = new Map(
      savedReminders.map(reminder => [reminder.id, new CustomReminder(reminder)])
    );
  }

  private async saveReminders() {
    const reminders = Array.from(this.reminders.values()).map(r => r.toJSON());
    await this.context.globalState.update('customReminders', reminders);
  }

  private setupEventListeners() {
    // Update active document language when editor changes
    vscode.window.onDidChangeActiveTextEditor(editor => {
      this.activeDocumentLanguage = editor?.document.languageId;
    });

    // Update typing stats when metrics are updated
    vscode.workspace.onDidChangeTextDocument(event => {
      // This is a simplified example - in a real implementation, you would
      // track actual typing speed and accuracy here
      const content = event.document.getText();
      const lines = content.split('\n').length;
      // Simulate typing speed update (replace with real metrics)
      this.typingStats.speed = Math.min(120, Math.max(20, lines / 5));
    });
  }

  private startChecking() {
    if (this.timer) {
      clearInterval(this.timer);
    }

    // Check reminders every 30 seconds
    this.timer = setInterval(() => this.checkReminders(), 30000);
  }

  private async checkReminders() {
    const now = Date.now();
    const sessionDuration = (now - this.sessionStartTime) / 1000; // in seconds

    for (const [id, reminder] of this.reminders.entries()) {
      if (reminder.shouldTrigger(this.typingStats, this.activeDocumentLanguage, sessionDuration)) {
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
    this.typingStats = { ...stats };
  }

  public dispose() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
