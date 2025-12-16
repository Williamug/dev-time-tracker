import * as vscode from 'vscode';
import { MetricsCollector } from '../models/Metrics';
import { BackendService } from './BackendService';
import { HealthStatusBar } from '../status/HealthStatusBar';

export class HealthService {
  private static instance: HealthService;
  private metricsCollector = MetricsCollector.getInstance();
  private disposables: vscode.Disposable[] = [];
  private timers: NodeJS.Timeout[] = [];
  private backendService: BackendService | null = null;

  // Break reminder settings
  private breakReminderInterval = 60; // 60 minutes default
  private breakReminderEnabled = true;
  private breakSnoozeDuration = 15; // 15 minutes default
  private breakNotificationType: 'info' | 'warning' | 'error' | 'none' = 'none';
  private breakEnableSound = false;
  private breakSnoozedUntil = 0;
  private context?: vscode.ExtensionContext;

  // Posture reminder settings
  private postureReminderInterval = 30; // 30 minutes default
  private postureReminderEnabled = true;
  private postureSnoozeDuration = 15; // 15 minutes default
  private postureNotificationType: 'info' | 'warning' | 'error' | 'none' = 'none';
  private postureEnableSound = false;
  private postureSnoozedUntil = 0;

  // Eye strain settings
  private eyeStrainInterval = 20; // 20 minutes default (20-20-20 rule)
  private eyeStrainEnabled = true;
  private eyeStrainSnoozeDuration = 10; // 10 minutes default
  private eyeStrainNotificationType: 'info' | 'warning' | 'error' | 'none' = 'none';
  private eyeStrainEnableSound = false;
  private eyeStrainSnoozedUntil = 0;

  // State
  private lastBreakTime: number;
  private lastPostureCheck: number;
  private lastEyeStrainBreak: number;
  private isActive: boolean;
  public healthStatusBar: HealthStatusBar;
  private breakTimer: NodeJS.Timeout | null = null;
  private eyeExerciseTimer: NodeJS.Timeout | null = null;

  private constructor(backendService?: BackendService, context?: vscode.ExtensionContext) {
    this.context = context;

    // Initialize timestamps
    const now = Date.now();
    this.lastBreakTime = now;
    this.lastPostureCheck = now;
    this.lastEyeStrainBreak = now;
    this.isActive = true;
    this.backendService = backendService || null;

    // Initialize status bar
    this.healthStatusBar = HealthStatusBar.getInstance();

    // Load configuration and initialize
    this.loadConfig();
    this.initialize();
  }

  public static getInstance(backendService?: BackendService, context?: vscode.ExtensionContext): HealthService {
    if (!HealthService.instance) {
      HealthService.instance = new HealthService(backendService, context);
    } else {
      if (backendService) HealthService.instance.backendService = backendService;
      if (context) HealthService.instance.context = context;
    }
    return HealthService.instance;
  }

  private initialize(): void {

    this.setupEventListeners();
    this.startTimers();

  }

  private loadConfig(): void {
    try {
      const config = vscode.workspace.getConfiguration('devtimetracker.health');

      // Break reminder settings (convert seconds to minutes) - ensure values are numbers
      const breakInterval = config.get<number>('breakReminderInterval') ?? 3600;
      this.breakReminderInterval = Math.floor(Number(breakInterval) / 60);
      this.breakReminderEnabled = config.get<boolean>('breakReminderEnabled') ?? true;
      const breakSnooze = config.get<number>('breakSnoozeDuration') ?? 900;
      this.breakSnoozeDuration = Math.floor(Number(breakSnooze) / 60);
      this.breakNotificationType = config.get<'info' | 'warning' | 'error' | 'none'>('breakNotificationType') ?? 'info';
      this.breakEnableSound = config.get<boolean>('breakEnableSound') ?? false;

      // Posture reminder settings (convert seconds to minutes) - ensure values are numbers
      const postureInterval = config.get<number>('postureReminderInterval') ?? 1800;
      this.postureReminderInterval = Math.floor(Number(postureInterval) / 60);
      this.postureReminderEnabled = config.get<boolean>('postureReminderEnabled') ?? true;
      const postureSnooze = config.get<number>('postureSnoozeDuration') ?? 900;
      this.postureSnoozeDuration = Math.floor(Number(postureSnooze) / 60);
      this.postureNotificationType = config.get<'info' | 'warning' | 'error' | 'none'>('postureNotificationType') ?? 'info';
      this.postureEnableSound = config.get<boolean>('postureEnableSound') ?? false;

      // Eye strain reminder settings (convert seconds to minutes) - ensure values are numbers
      const eyeStrainInt = config.get<number>('eyeStrainReminderInterval') ?? 1200;
      this.eyeStrainInterval = Math.floor(Number(eyeStrainInt) / 60);
      this.eyeStrainEnabled = config.get<boolean>('eyeStrainReminderEnabled') ?? true;
      const eyeStrainSnooze = config.get<number>('eyeStrainSnoozeDuration') ?? 600;
      this.eyeStrainSnoozeDuration = Math.floor(Number(eyeStrainSnooze) / 60);
      this.eyeStrainNotificationType = config.get<'info' | 'warning' | 'error' | 'none'>('eyeStrainNotificationType') ?? 'info';
      this.eyeStrainEnableSound = config.get<boolean>('eyeStrainEnableSound') ?? false;    } catch (error) {

      this.setDefaultConfig();
    }
  }

  private setDefaultConfig(): void {
    // Break reminder defaults (in minutes)
    this.breakReminderInterval = 60; // 60 minutes (3600 seconds)
    this.breakReminderEnabled = true;
    this.breakSnoozeDuration = 15; // 15 minutes (900 seconds)
    this.breakNotificationType = 'info';
    this.breakEnableSound = false;
    this.breakSnoozedUntil = 0;

    // Posture reminder defaults (in minutes)
    this.postureReminderInterval = 30; // 30 minutes (1800 seconds)
    this.postureReminderEnabled = true;
    this.postureSnoozeDuration = 15; // 15 minutes (900 seconds)
    this.postureNotificationType = 'info';
    this.postureEnableSound = false;
    this.postureSnoozedUntil = 0;

    // Eye strain defaults (in minutes)
    this.eyeStrainInterval = 20; // 20 minutes (1200 seconds)
    this.eyeStrainEnabled = true;
    this.eyeStrainSnoozeDuration = 10; // 10 minutes (600 seconds)
    this.eyeStrainNotificationType = 'info';
    this.eyeStrainEnableSound = false;
    this.eyeStrainSnoozedUntil = 0;
  }  private setupEventListeners(): void {
    // Window focus change
    this.disposables.push(
      vscode.window.onDidChangeWindowState(state => {
        this.isActive = state.focused;
        if (this.isActive) {
          this.restartTimers();
        } else {
          this.clearTimers();
        }
      })
    );

    // Configuration changes
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('devtimetracker.health')) {
          const wasBreakEnabled = this.breakReminderEnabled;
          const wasPostureEnabled = this.postureReminderEnabled;
          const wasEyeStrainEnabled = this.eyeStrainEnabled;

          this.loadConfig();

          // Clear status bar items if reminders were disabled
          if (wasBreakEnabled && !this.breakReminderEnabled) {
            this.healthStatusBar.clearBreakReminder();
          }
          if (wasPostureEnabled && !this.postureReminderEnabled) {
            this.healthStatusBar.clearPostureReminder();
          }
          if (wasEyeStrainEnabled && !this.eyeStrainEnabled) {
            this.healthStatusBar.clearEyeStrainReminder();
          }

          this.restartTimers();
        }
      })
    );
  }

  private startTimers(): void {
    this.clearTimers();

    // Start break reminder timer if enabled
    if (this.breakReminderEnabled) {

      const breakTimer = setInterval(() => this.checkBreakReminder(), 60000); // Check every minute
      this.timers.push(breakTimer);
    } else {
      this.healthStatusBar.clearBreakReminder();
    }

    // Start posture reminder timer if enabled
    if (this.postureReminderEnabled) {

      const postureTimer = setInterval(() => this.checkPostureReminder(), 60000); // Check every minute
      this.timers.push(postureTimer);
    } else {
      this.healthStatusBar.clearPostureReminder();
    }

    // Start eye strain timer if enabled
    if (this.eyeStrainEnabled) {

      const eyeStrainTimer = setInterval(() => this.checkEyeStrainReminder(), 60000); // Check every minute
      this.timers.push(eyeStrainTimer);
    } else {
      this.healthStatusBar.clearEyeStrainReminder();
    }
  }

  private restartTimers(): void {
    this.startTimers();
  }

  private clearTimers(): void {
    this.timers.forEach(timer => clearInterval(timer));
    this.timers = [];
  }

  private async checkBreakReminder(): Promise<void> {
    if (!this.breakReminderEnabled) {
      this.healthStatusBar.clearBreakReminder();
      return;
    }

    const now = Date.now();

    // Check if snoozed
    if (this.breakSnoozedUntil > 0 && now < this.breakSnoozedUntil) {
      const minutesRemaining = Math.ceil((this.breakSnoozedUntil - now) / 60000);
      this.healthStatusBar.updateBreakReminder(minutesRemaining);
      return;
    }

    // Reset snooze if expired
    if (this.breakSnoozedUntil > 0 && now >= this.breakSnoozedUntil) {
      this.breakSnoozedUntil = 0;
      this.lastBreakTime = now; // Reset timer after snooze expires
    }

    const timeSinceLastBreak = now - this.lastBreakTime;
    const intervalMs = this.breakReminderInterval * 60000;

    if (timeSinceLastBreak >= intervalMs) {
      await this.showBreakReminder();
      // Timer is reset inside showBreakReminder()
    } else {
      const minutesRemaining = Math.ceil((intervalMs - timeSinceLastBreak) / 60000);
      this.healthStatusBar.updateBreakReminder(minutesRemaining);
    }
  }

  private async checkPostureReminder(): Promise<void> {
    if (!this.postureReminderEnabled) {
      this.healthStatusBar.clearPostureReminder();
      return;
    }

    const now = Date.now();

    // Check if snoozed
    if (this.postureSnoozedUntil > 0 && now < this.postureSnoozedUntil) {
      const minutesRemaining = Math.ceil((this.postureSnoozedUntil - now) / 60000);
      this.healthStatusBar.updatePostureReminder(minutesRemaining);
      return;
    }

    // Reset snooze if expired
    if (this.postureSnoozedUntil > 0 && now >= this.postureSnoozedUntil) {
      this.postureSnoozedUntil = 0;
      this.lastPostureCheck = now; // Reset timer after snooze expires
    }

    const timeSinceLastCheck = now - this.lastPostureCheck;
    const intervalMs = this.postureReminderInterval * 60000;

    if (timeSinceLastCheck >= intervalMs) {
      await this.showPostureReminder();
      // Timer is reset inside showPostureReminder()
    } else {
      const minutesRemaining = Math.ceil((intervalMs - timeSinceLastCheck) / 60000);
      this.healthStatusBar.updatePostureReminder(minutesRemaining);
    }
  }

  private async checkEyeStrainReminder(): Promise<void> {
    if (!this.eyeStrainEnabled) {
      this.healthStatusBar.clearEyeStrainReminder();
      return;
    }

    const now = Date.now();

    // Check if snoozed
    if (this.eyeStrainSnoozedUntil > 0 && now < this.eyeStrainSnoozedUntil) {
      const minutesRemaining = Math.ceil((this.eyeStrainSnoozedUntil - now) / 60000);
      this.healthStatusBar.updateEyeStrainReminder(minutesRemaining);
      return;
    }

    // Reset snooze if expired
    if (this.eyeStrainSnoozedUntil > 0 && now >= this.eyeStrainSnoozedUntil) {
      this.eyeStrainSnoozedUntil = 0;
      this.lastEyeStrainBreak = now; // Reset timer after snooze expires
    }

    const timeSinceLastBreak = now - this.lastEyeStrainBreak;
    const intervalMs = this.eyeStrainInterval * 60000;

    if (timeSinceLastBreak >= intervalMs) {
      await this.showEyeStrainReminder();
    } else {
      const minutesRemaining = Math.ceil((intervalMs - timeSinceLastBreak) / 60000);
      this.healthStatusBar.updateEyeStrainReminder(minutesRemaining);
    }
  }

  private async showBreakReminder(): Promise<void> {
    this.healthStatusBar.showBreakReminder(0); // Show active reminder in status bar
    this.lastBreakTime = Date.now(); // Reset timer after showing notification

    if (this.breakNotificationType !== 'none') {
      const intervalMinutes = this.breakReminderInterval;
      const message = `⏰ Time for a break! You've been coding for ${intervalMinutes} minutes. Stand up, stretch, and rest your eyes.`;
      await this.showNotification(message, 'break');
    }

    // Immediately update to show countdown again after a short delay
    setTimeout(() => this.checkBreakReminder(), 1000);
  }

  private async showPostureReminder(): Promise<void> {
    this.healthStatusBar.showPostureReminder(0); // Show active reminder in status bar
    this.lastPostureCheck = Date.now(); // Reset timer after showing notification

    if (this.postureNotificationType !== 'none') {
      const message = '🧍 Posture check! Sit up straight, adjust your chair height, and keep your feet flat on the floor.';
      await this.showNotification(message, 'posture');
    }

    // Immediately update to show countdown again after a short delay
    setTimeout(() => this.checkPostureReminder(), 1000);
  }

  private async showEyeStrainReminder(): Promise<void> {
    this.healthStatusBar.showEyeStrainReminder(0); // Show active reminder in status bar
    this.lastEyeStrainBreak = Date.now(); // Reset timer after showing notification

    if (this.eyeStrainNotificationType !== 'none') {
      const message = '👁️ Eye break time! Follow the 20-20-20 rule: Look at something 20 feet away for 20 seconds.';
      await this.showNotification(message, 'eyeStrain');
    }

    // Immediately update to show countdown again after a short delay
    setTimeout(() => this.checkEyeStrainReminder(), 1000);
  }

  private async showNotification(message: string, type: 'break' | 'posture' | 'eyeStrain'): Promise<void> {
    // Show a simple, non-blocking notification without action buttons
    vscode.window.showInformationMessage(message);

    // Log for debugging

  }

  private getReminderTypeLabel(type: 'break' | 'posture' | 'eyeStrain'): string {
    switch (type) {
      case 'break': return 'Break reminder';
      case 'posture': return 'Posture reminder';
      case 'eyeStrain': return 'Eye strain reminder';
    }
  }

  private async disableReminder(type: 'break' | 'posture' | 'eyeStrain'): Promise<void> {
    const config = vscode.workspace.getConfiguration('devtimetracker.health');
    const key = type === 'break' ? 'breakReminderEnabled' :
                type === 'posture' ? 'postureReminderEnabled' :
                'eyeStrainReminderEnabled';

    await config.update(key, false, vscode.ConfigurationTarget.Global);
    vscode.window.showInformationMessage(
      `${this.getReminderTypeLabel(type)} disabled. You can re-enable it in settings.`,
      'Open Settings'
    ).then(selection => {
      if (selection === 'Open Settings') {
        vscode.commands.executeCommand('workbench.action.openSettings', 'devtimetracker.health');
      }
    });
  }

  public async start202020Timer(): Promise<void> {
    // Show an information message with a 20-second countdown
    let countdown = 20;
    const countdownMessage = vscode.window.setStatusBarMessage(
      `$(eye) 20-20-20 Rule: Look at something 20 feet away for ${countdown} seconds...`
    );

    // Create a countdown timer
    const timer = setInterval(() => {
      countdown--;
      if (countdown > 0) {
        countdownMessage.dispose();
        vscode.window.setStatusBarMessage(
          `$(eye) 20-20-20 Rule: Look at something 20 feet away for ${countdown} seconds...`
        );
      } else {
        clearInterval(timer);
        countdownMessage.dispose();
        vscode.window.showInformationMessage('$(check) Great! Your 20-20-20 break is complete. Your eyes should feel refreshed!');

        // Reset the eye strain timer
        this.lastEyeStrainBreak = Date.now();
      }
    }, 1000);

    // Show initial notification
    vscode.window.showInformationMessage(
      '$(eye) Starting 20-20-20 timer: Look at something 20 feet away for 20 seconds.',
      'Cancel'
    ).then(selection => {
      if (selection === 'Cancel') {
        clearInterval(timer);
        countdownMessage.dispose();
        vscode.window.showInformationMessage('20-20-20 timer cancelled');
      }
    });
  }

  public dispose(): void {
    this.clearTimers();
    this.disposables.forEach(disposable => disposable.dispose());
    this.disposables = [];
  }

  // Helper to format time (mm:ss)
  private formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
}
