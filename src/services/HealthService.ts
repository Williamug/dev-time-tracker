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
    
    // Force show all status bar items for testing
    this.healthStatusBar.showBreakReminder(1);
    this.healthStatusBar.showPostureReminder(1);
    this.healthStatusBar.showEyeStrainReminder(1);

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
      
      // Break reminder settings
      this.breakReminderInterval = config.get<number>('breakReminderInterval') ?? 1;
      this.breakReminderEnabled = config.get<boolean>('breakReminderEnabled') ?? true;
      this.breakSnoozeDuration = config.get<number>('breakSnoozeDuration') ?? 5;
      this.breakNotificationType = config.get<'info' | 'warning' | 'error' | 'none'>('breakNotificationType') ?? 'none';
      this.breakEnableSound = config.get<boolean>('breakEnableSound') ?? false;
      
      // Posture reminder settings
      this.postureReminderInterval = config.get<number>('postureReminderInterval') ?? 1;
      this.postureReminderEnabled = config.get<boolean>('postureReminderEnabled') ?? true;
      this.postureSnoozeDuration = config.get<number>('postureSnoozeDuration') ?? 5;
      this.postureNotificationType = config.get<'info' | 'warning' | 'error' | 'none'>('postureNotificationType') ?? 'none';
      this.postureEnableSound = config.get<boolean>('postureEnableSound') ?? false;
      
      // Eye strain reminder settings
      this.eyeStrainInterval = config.get<number>('eyeStrainInterval') ?? 1;
      this.eyeStrainEnabled = config.get<boolean>('eyeStrainEnabled') ?? true;
      this.eyeStrainSnoozeDuration = config.get<number>('eyeStrainSnoozeDuration') ?? 5;
      this.eyeStrainNotificationType = config.get<'info' | 'warning' | 'error' | 'none'>('eyeStrainNotificationType') ?? 'none';
      this.eyeStrainEnableSound = config.get<boolean>('eyeStrainEnableSound') ?? false;
      
    } catch (error) {
      console.error('[HealthService] Error loading configuration:', error);
      this.setDefaultConfig();
    }
  }

  private setDefaultConfig(): void {
    // Break reminder defaults
    this.breakReminderInterval = 1;
    this.breakReminderEnabled = true;
    this.breakSnoozeDuration = 5;
    this.breakNotificationType = 'none';
    this.breakEnableSound = false;
    this.breakSnoozedUntil = 0;
    
    // Posture reminder defaults
    this.postureReminderInterval = 1;
    this.postureReminderEnabled = true;
    this.postureSnoozeDuration = 5;
    this.postureNotificationType = 'none';
    this.postureEnableSound = false;
    this.postureSnoozedUntil = 0;
    
    // Eye strain defaults
    this.eyeStrainInterval = 1;
    this.eyeStrainEnabled = true;
    this.eyeStrainSnoozeDuration = 5;
    this.eyeStrainNotificationType = 'none';
    this.eyeStrainEnableSound = false;
    this.eyeStrainSnoozedUntil = 0;
  }

  private setupEventListeners(): void {
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
          this.loadConfig();
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
      const breakTimer = setInterval(() => this.checkBreakReminder(), 1000); // 1 second for testing
      this.timers.push(breakTimer);
      // Show initial reminder
      this.healthStatusBar.showBreakReminder(1);
    }

    // Start posture reminder timer if enabled
    if (this.postureReminderEnabled) {
      console.log('[HealthService] Starting posture reminder timer');
      const postureTimer = setInterval(() => this.checkPostureReminder(), 1000); // 1 second for testing
      this.timers.push(postureTimer);
      // Show initial reminder
      this.healthStatusBar.showPostureReminder(1);
    }

    // Start eye strain timer if enabled
    if (this.eyeStrainEnabled) {
      console.log('[HealthService] Starting eye strain reminder timer');
      const eyeStrainTimer = setInterval(() => this.checkEyeStrainReminder(), 1000); // 1 second for testing
      this.timers.push(eyeStrainTimer);
      // Show initial reminder
      this.healthStatusBar.showEyeStrainReminder(1);
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
    const now = Date.now();
    if (now > this.lastBreakTime + this.breakReminderInterval * 60000) {
      await this.showBreakReminder();
    }
  }

  private async checkPostureReminder(): Promise<void> {
    const now = Date.now();
    if (now > this.lastPostureCheck + this.postureReminderInterval * 60000) {
      await this.showPostureReminder();
    }
  }

  private async checkEyeStrainReminder(): Promise<void> {
    const now = Date.now();
    if (now > this.lastEyeStrainBreak + this.eyeStrainInterval * 60000) {
      await this.showEyeStrainReminder();
    }
  }

  private async showBreakReminder(): Promise<void> {
    if (this.breakNotificationType !== 'none') {
      const message = 'Time to take a break!';
      await this.showNotification(message, 'break');
    }
    this.lastBreakTime = Date.now();
  }

  private async showPostureReminder(): Promise<void> {
    if (this.postureNotificationType !== 'none') {
      const message = 'Check your posture!';
      await this.showNotification(message, 'posture');
    }
    this.lastPostureCheck = Date.now();
  }

  private async showEyeStrainReminder(): Promise<void> {
    if (this.eyeStrainNotificationType !== 'none') {
      const message = 'Time to rest your eyes!';
      await this.showNotification(message, 'eyeStrain');
    }
    this.lastEyeStrainBreak = Date.now();
  }

  private async showNotification(message: string, type: 'break' | 'posture' | 'eyeStrain'): Promise<void> {
    const snoozeMinutes = type === 'break' ? this.breakSnoozeDuration : 
                         type === 'posture' ? this.postureSnoozeDuration : 
                         this.eyeStrainSnoozeDuration;
    
    const snoozeLabel = `Snooze (${snoozeMinutes}m)`;
    const selection = await vscode.window.showInformationMessage(message, snoozeLabel, 'Dismiss');
    
    if (selection === snoozeLabel) {
      const snoozeTime = Date.now() + (snoozeMinutes * 60000);
      if (type === 'break') this.breakSnoozedUntil = snoozeTime;
      else if (type === 'posture') this.postureSnoozedUntil = snoozeTime;
      else this.eyeStrainSnoozedUntil = snoozeTime;
    }
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
