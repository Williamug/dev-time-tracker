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
  private breakReminderInterval = 1;
  private breakReminderEnabled = true;
  private breakSnoozeDuration = 5;
  private breakNotificationType: 'info' | 'warning' | 'error' | 'none' = 'none';
  private breakEnableSound = false;
  private breakSnoozedUntil = 0;
  private context?: vscode.ExtensionContext;

  // Posture reminder settings
  private postureReminderInterval = 1;
  private postureReminderEnabled = true;
  private postureSnoozeDuration = 5;
  private postureNotificationType: 'info' | 'warning' | 'error' | 'none' = 'none';
  private postureEnableSound = false;
  private postureSnoozedUntil = 0;

  // Eye strain settings
  private eyeStrainInterval = 1;
  private eyeStrainEnabled = true;
  private eyeStrainSnoozeDuration = 5;
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
    console.log('[HealthService] HealthStatusBar initialized');

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
    console.log('[HealthService] Initializing...');
    this.setupEventListeners();
    this.startTimers();
    console.log('[HealthService] Initialization complete');
  }

  private loadConfig(): void {
    try {
      const config = vscode.workspace.getConfiguration('devtimetracker.health');
      console.log('[HealthService] Loading configuration');

      // Break reminder settings (convert seconds to minutes)
      this.breakReminderInterval = Math.floor((config.get<number>('breakReminderInterval') ?? 3600) / 60);
      this.breakReminderEnabled = config.get<boolean>('breakReminderEnabled') ?? true;
      this.breakSnoozeDuration = Math.floor((config.get<number>('breakSnoozeDuration') ?? 900) / 60);
      this.breakNotificationType = config.get<'info' | 'warning' | 'error' | 'none'>('breakNotificationType') ?? 'none';
      this.breakEnableSound = config.get<boolean>('breakEnableSound') ?? false;

      // Posture reminder settings (convert seconds to minutes)
      this.postureReminderInterval = Math.floor((config.get<number>('postureReminderInterval') ?? 1800) / 60);
      this.postureReminderEnabled = config.get<boolean>('postureReminderEnabled') ?? true;
      this.postureSnoozeDuration = Math.floor((config.get<number>('postureSnoozeDuration') ?? 900) / 60);
      this.postureNotificationType = config.get<'info' | 'warning' | 'error' | 'none'>('postureNotificationType') ?? 'none';
      this.postureEnableSound = config.get<boolean>('postureEnableSound') ?? false;

      // Eye strain reminder settings (convert seconds to minutes)
      this.eyeStrainInterval = Math.floor((config.get<number>('eyeStrainReminderInterval') ?? 1200) / 60);
      this.eyeStrainEnabled = config.get<boolean>('eyeStrainReminderEnabled') ?? true;
      this.eyeStrainSnoozeDuration = Math.floor((config.get<number>('eyeStrainSnoozeDuration') ?? 600) / 60);
      this.eyeStrainNotificationType = config.get<'info' | 'warning' | 'error' | 'none'>('eyeStrainNotificationType') ?? 'none';
      this.eyeStrainEnableSound = config.get<boolean>('eyeStrainEnableSound') ?? false;    } catch (error) {
      console.error('[HealthService] Error loading configuration:', error);
      this.setDefaultConfig();
    }
  }

  private setDefaultConfig(): void {
    // Break reminder defaults (in minutes)
    this.breakReminderInterval = 60; // 60 minutes (3600 seconds)
    this.breakReminderEnabled = true;
    this.breakSnoozeDuration = 15; // 15 minutes (900 seconds)
    this.breakNotificationType = 'none';
    this.breakEnableSound = false;
    this.breakSnoozedUntil = 0;

    // Posture reminder defaults (in minutes)
    this.postureReminderInterval = 30; // 30 minutes (1800 seconds)
    this.postureReminderEnabled = true;
    this.postureSnoozeDuration = 15; // 15 minutes (900 seconds)
    this.postureNotificationType = 'none';
    this.postureEnableSound = false;
    this.postureSnoozedUntil = 0;

    // Eye strain defaults (in minutes)
    this.eyeStrainInterval = 20; // 20 minutes (1200 seconds)
    this.eyeStrainEnabled = true;
    this.eyeStrainSnoozeDuration = 10; // 10 minutes (600 seconds)
    this.eyeStrainNotificationType = 'none';
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
      console.log('[HealthService] Starting break reminder timer');
      const breakTimer = setInterval(() => this.checkBreakReminder(), 60000); // Check every minute
      this.timers.push(breakTimer);
    } else {
      this.healthStatusBar.clearBreakReminder();
    }

    // Start posture reminder timer if enabled
    if (this.postureReminderEnabled) {
      console.log('[HealthService] Starting posture reminder timer');
      const postureTimer = setInterval(() => this.checkPostureReminder(), 60000); // Check every minute
      this.timers.push(postureTimer);
    } else {
      this.healthStatusBar.clearPostureReminder();
    }

    // Start eye strain timer if enabled
    if (this.eyeStrainEnabled) {
      console.log('[HealthService] Starting eye strain reminder timer');
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
    }

    const timeSinceLastBreak = now - this.lastBreakTime;
    const intervalMs = this.breakReminderInterval * 60000;

    if (timeSinceLastBreak >= intervalMs) {
      await this.showBreakReminder();
    } else {
      const minutesRemaining = Math.ceil((intervalMs - timeSinceLastBreak) / 60000);
      this.healthStatusBar.updateBreakReminder(minutesRemaining);
    }
  }

  private async checkPostureReminder(): Promise<void> {
    if (!this.postureReminderEnabled) {
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
    }

    const timeSinceLastCheck = now - this.lastPostureCheck;
    const intervalMs = this.postureReminderInterval * 60000;

    if (timeSinceLastCheck >= intervalMs) {
      await this.showPostureReminder();
    } else {
      const minutesRemaining = Math.ceil((intervalMs - timeSinceLastCheck) / 60000);
      this.healthStatusBar.updatePostureReminder(minutesRemaining);
    }
  }

  private async checkEyeStrainReminder(): Promise<void> {
    if (!this.eyeStrainEnabled) {
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
    const now = Date.now();
    this.healthStatusBar.showBreakReminder(0); // Show active reminder in status bar

    if (this.breakNotificationType !== 'none') {
      const intervalMinutes = this.breakReminderInterval;
      const message = `⏰ Time for a break! You've been coding for ${intervalMinutes} minutes. Stand up, stretch, and rest your eyes.`;
      await this.showNotification(message, 'break');
    }

    this.lastBreakTime = now;
  }

  private async showPostureReminder(): Promise<void> {
    const now = Date.now();
    this.healthStatusBar.showPostureReminder(0); // Show active reminder in status bar

    if (this.postureNotificationType !== 'none') {
      const message = '🧍 Posture check! Sit up straight, adjust your chair height, and keep your feet flat on the floor.';
      await this.showNotification(message, 'posture');
    }

    this.lastPostureCheck = now;
  }

  private async showEyeStrainReminder(): Promise<void> {
    const now = Date.now();
    this.healthStatusBar.showEyeStrainReminder(0); // Show active reminder in status bar

    if (this.eyeStrainNotificationType !== 'none') {
      const message = '👁️ Eye break time! Follow the 20-20-20 rule: Look at something 20 feet away for 20 seconds.';
      await this.showNotification(message, 'eyeStrain');
    }

    this.lastEyeStrainBreak = now;
  }

  private async showNotification(message: string, type: 'break' | 'posture' | 'eyeStrain'): Promise<void> {
    const snoozeMinutes = type === 'break' ? this.breakSnoozeDuration :
                         type === 'posture' ? this.postureSnoozeDuration :
                         this.eyeStrainSnoozeDuration;

    // Show a non-blocking notification in the bottom right
    const snoozeLabel = `$(clock) Snooze for ${snoozeMinutes} minutes`;
    const dismissLabel = `$(check) Got it!`;
    const disableLabel = `$(x) Disable ${type === 'break' ? 'break' : type === 'posture' ? 'posture' : 'eye strain'} reminders`;
    
    // Use showInformationMessage but don't await it - this is less intrusive
    vscode.window.showInformationMessage(
      message,
      { modal: false }, // Non-blocking
      snoozeLabel,
      dismissLabel,
      disableLabel
    ).then(selection => {
      if (selection === snoozeLabel) {
        const snoozeTime = Date.now() + (snoozeMinutes * 60000);
        if (type === 'break') {
          this.breakSnoozedUntil = snoozeTime;
          this.healthStatusBar.updateBreakReminder(snoozeMinutes);
        } else if (type === 'posture') {
          this.postureSnoozedUntil = snoozeTime;
          this.healthStatusBar.updatePostureReminder(snoozeMinutes);
        } else {
          this.eyeStrainSnoozedUntil = snoozeTime;
          this.healthStatusBar.updateEyeStrainReminder(snoozeMinutes);
        }
        vscode.window.showInformationMessage(`${this.getReminderTypeLabel(type)} snoozed for ${snoozeMinutes} minutes`);
        console.log(`[HealthService] ${type} snoozed for ${snoozeMinutes} minutes`);
      } else if (selection === dismissLabel) {
        // Update status bar to show next reminder time
        if (type === 'break') {
          const minutesUntilNext = this.breakReminderInterval;
          this.healthStatusBar.updateBreakReminder(minutesUntilNext);
        } else if (type === 'posture') {
          const minutesUntilNext = this.postureReminderInterval;
          this.healthStatusBar.updatePostureReminder(minutesUntilNext);
        } else {
          const minutesUntilNext = this.eyeStrainInterval;
          this.healthStatusBar.updateEyeStrainReminder(minutesUntilNext);
        }
        console.log(`[HealthService] ${type} reminder dismissed`);
      } else if (selection === disableLabel) {
        // Disable the reminder type
        this.disableReminder(type);
      }
    });
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
