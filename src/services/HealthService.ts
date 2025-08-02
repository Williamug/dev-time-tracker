import * as vscode from 'vscode';
import { MetricsCollector } from '../models/Metrics';
import { NotificationManager } from '../utils/NotificationManager';
import { BackendService } from './BackendService';

export class HealthService {
  private static instance: HealthService;
  private metricsCollector = MetricsCollector.getInstance();
  private disposables: vscode.Disposable[] = [];
  private timers: NodeJS.Timeout[] = [];
  private backendService: BackendService | null = null;

  // Break reminder settings
  private breakReminderInterval = 60 * 60; // 60 minutes
  private breakReminderEnabled = true;
  private breakSnoozeDuration = 15 * 60; // 15 minutes
  private breakNotificationType: 'info' | 'warning' | 'error' | 'none' = 'warning';
  private breakEnableSound = true;
  private breakSnoozedUntil = 0;
  
  // Posture reminder settings
  private postureReminderInterval = 30 * 60; // 30 minutes
  private postureReminderEnabled = true;
  private postureSnoozeDuration = 15 * 60; // 15 minutes
  private postureNotificationType: 'info' | 'warning' | 'error' | 'none' = 'info';
  private postureEnableSound = true;
  private postureSnoozedUntil = 0;
  
  // Eye strain settings
  private eyeStrainInterval = 20 * 60; // 20 minutes
  private eyeStrainEnabled = true;
  private eyeStrainSnoozeDuration = 10 * 60; // 10 minutes
  private eyeStrainNotificationType: 'info' | 'warning' | 'error' | 'none' = 'info';
  private eyeStrainEnableSound = true;
  
  private lastBreakTime: number;
  private lastPostureCheck: number;
  private lastEyeStrainBreak: number;
  private isActive: boolean;
  private breakStatusBarItem: vscode.StatusBarItem | undefined;
  private breakTimer: NodeJS.Timeout | null = null;
  private eyeExerciseTimer: NodeJS.Timeout | null = null;
  private eyeStrainSnoozedUntil: number = 0;

  private constructor(backendService?: BackendService) {
    // Load configuration first
    this.loadConfig();
    
    // Initialize timestamps
    const now = Date.now();
    this.lastBreakTime = now;
    this.lastPostureCheck = now;
    this.lastEyeStrainBreak = now;
    this.eyeStrainSnoozedUntil = 0;
    this.isActive = true;
    this.backendService = backendService || null;
    
    this.initialize();
  }

  public static getInstance(backendService?: BackendService): HealthService {
    if (!HealthService.instance) {
      HealthService.instance = new HealthService(backendService);
    } else if (backendService) {
      // Update backend service reference if provided
      HealthService.instance.backendService = backendService;
    }
    return HealthService.instance;
  }

  private initialize() {
    this.loadConfig();
    this.setupEventListeners();
    this.startTimers();
    
    // Listen for configuration changes
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('devtimetracker.health')) {
        this.loadConfig();
        this.restartTimers();
      }
    });
  }

  private loadConfig() {
    const config = vscode.workspace.getConfiguration('devtimetracker.health');
    
    // Break reminder settings with all configuration options
    this.breakReminderInterval = config.get<number>('breakReminderInterval') ?? 60 * 60;
    this.breakReminderEnabled = config.get<boolean>('breakReminderEnabled') ?? true;
    this.breakSnoozeDuration = config.get<number>('breakSnoozeDuration') ?? 15 * 60;
    
    // Handle all notification type configurations with fallbacks
    this.breakNotificationType = (config.get<string>('breakNotificationType') || 
                                 config.get<string>('breakReminderNotificationType') || 
                                 config.get<string>('breakReminderType') || 
                                 'info') as 'info' | 'warning' | 'error' | 'none';
    
    // Handle all sound configurations with fallbacks
    this.breakEnableSound = config.get<boolean>('breakEnableSound') ?? 
                           config.get<boolean>('breakReminderSound') ?? 
                           true;
    
    // Get sound file and volume if needed (for future use)
    const breakSoundFile = config.get<string>('breakReminderSoundFile') || 'default';
    const breakSoundVolume = config.get<number>('breakReminderSoundVolume') ?? 0.5;
    
    // Get break duration (for future use in break timer)
    const breakDuration = config.get<number>('breakReminderTime') ?? 60;
    
    // Posture reminder settings
    this.postureReminderInterval = config.get<number>('postureReminderInterval') ?? 30 * 60;
    this.postureReminderEnabled = config.get<boolean>('postureReminderEnabled') ?? true;
    this.postureSnoozeDuration = config.get<number>('postureSnoozeDuration') ?? 15 * 60;
    this.postureNotificationType = (config.get<string>('postureNotificationType') as any) ?? 'info';
    this.postureEnableSound = config.get<boolean>('postureEnableSound') ?? true;
    
    // Eye strain settings
    this.eyeStrainInterval = config.get<number>('eyeStrainInterval') ?? 20 * 60;
    this.eyeStrainEnabled = config.get<boolean>('eyeStrainEnabled') ?? true;
    this.eyeStrainSnoozeDuration = config.get<number>('eyeStrainSnoozeDuration') ?? 10 * 60;
    this.eyeStrainNotificationType = (config.get<string>('eyeStrainNotificationType') as any) ?? 'info';
    this.eyeStrainEnableSound = config.get<boolean>('eyeStrainEnableSound') ?? true;
    
    console.log('[HealthService] Configuration loaded:', {
      // Break settings
      breakReminderEnabled: this.breakReminderEnabled,
      breakReminderInterval: this.breakReminderInterval,
      breakSnoozeDuration: this.breakSnoozeDuration,
      breakNotificationType: this.breakNotificationType,
      
      // Posture settings
      postureReminderEnabled: this.postureReminderEnabled,
      postureReminderInterval: this.postureReminderInterval,
      postureSnoozeDuration: this.postureSnoozeDuration,
      postureNotificationType: this.postureNotificationType,
      
      // Eye strain settings
      eyeStrainEnabled: this.eyeStrainEnabled,
      eyeStrainInterval: this.eyeStrainInterval,
      eyeStrainSnoozeDuration: this.eyeStrainSnoozeDuration,
      eyeStrainNotificationType: this.eyeStrainNotificationType,
      eyeStrainEnableSound: this.eyeStrainEnableSound
    });
  }

  private setupEventListeners() {
    // Track user activity to pause reminders when inactive
    this.disposables.push(
      vscode.window.onDidChangeWindowState(state => {
        this.isActive = state.focused;
        if (this.isActive) {
          this.checkReminders();
        }
      })
    );
  }

  private startTimers() {
    // Clear any existing timers
    this.clearTimers();

    // Set up new timers
    this.timers.push(
      setInterval(() => this.checkBreakReminder(), 60 * 1000), // Check every minute
      setInterval(() => this.checkPostureReminder(), 60 * 1000),
      setInterval(() => this.checkEyeStrainReminder(), 60 * 1000)
    );
  }

  private clearTimers() {
    this.timers.forEach(timer => clearInterval(timer));
    this.timers = [];
  }

  private restartTimers() {
    this.clearTimers();
    this.startTimers();
  }

  private checkReminders() {
    this.checkBreakReminder();
    this.checkPostureReminder();
    this.checkEyeStrainReminder();
  }

  private async isPomodoroActive(): Promise<boolean> {
    try {
      // Use the command to get Pomodoro state
      const state = await vscode.commands.executeCommand<{
        isRunning: boolean;
        isBreakTime: boolean;
      }>('devtimetracker.getPomodoroState');
      
      return state?.isRunning && !state.isBreakTime;
    } catch (error) {
      console.error('Error checking Pomodoro state:', error);
      return false;
    }
  }

  private async checkBreakReminder() {
    const now = Date.now();
    
    // Check if break reminders are enabled and not snoozed, and Pomodoro is not in a work session
    if (!this.breakReminderEnabled || 
        this.breakReminderInterval <= 0 || 
        !this.isActive || 
        now < this.breakSnoozedUntil ||
        await this.isPomodoroActive()) {
      return;
    }

    const timeSinceLastBreak = (now - this.lastBreakTime) / 1000; // in seconds
    const minutesWorking = Math.floor(timeSinceLastBreak / 60);

    if (timeSinceLastBreak >= this.breakReminderInterval) {
      const notification = NotificationManager.getInstance();
      
      const selection = await notification.showNotificationCard({
        title: '⏱️ Time for a Break!',
        message: `You've been working for ${minutesWorking} minutes. ` +
                'Taking regular breaks helps maintain focus and productivity.\n\n' +
                '**Break Ideas**:\n' +
                '• Stand up and stretch\n' +
                '• Look away from the screen\n' +
                '• Take a short walk\n' +
                '• Get some water or a snack',
        type: this.breakNotificationType as any,
        sound: this.breakEnableSound ? 'alert' : 'none',
        actions: [
          { title: 'Start 5-min Break', action: 'takeBreak', isPrimary: true },
          { title: `Snooze (${this.breakSnoozeDuration / 60} min)`, action: 'snooze' },
          { title: 'Disable for Today', action: 'disableToday' }
        ]
      });

      switch (selection) {
        case 'takeBreak':
          this.showBreakTimer(5 * 60); // 5 minutes
          this.lastBreakTime = now;
          break;
          
        case 'snooze':
          this.breakSnoozedUntil = now + (this.breakSnoozeDuration * 1000);
          vscode.window.showInformationMessage(
            `Break reminder snoozed for ${this.breakSnoozeDuration / 60} minutes.`
          );
          break;
          
        case 'disableToday':
          // Snooze until tomorrow
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          tomorrow.setHours(0, 0, 0, 0);
          this.breakSnoozedUntil = tomorrow.getTime();
          vscode.window.showInformationMessage('Break reminders disabled for today.');
          break;
          
        case 'dismiss':
          this.lastBreakTime = now;
          break;
      }
    }
  }

  private async checkPostureReminder() {
    const now = Date.now();
    
    // Check if posture reminders are enabled and not snoozed
    if (!this.postureReminderEnabled || 
        this.postureReminderInterval <= 0 || 
        !this.isActive || 
        now < this.postureSnoozedUntil) {
      return;
    }

    const timeSinceLastCheck = (now - this.lastPostureCheck) / 1000; // in seconds

    if (timeSinceLastCheck >= this.postureReminderInterval) {
      const notification = NotificationManager.getInstance();
      const minutes = Math.floor(timeSinceLastCheck / 60);
      
      const selection = await notification.showNotificationCard({
        title: '🧘 Posture Check',
        message: `You've been sitting for ${minutes} minutes.\n\n` +
                '**Good posture tips**:\n' +
                '• Sit up straight with your back supported\n' +
                '• Keep your shoulders relaxed and elbows at 90°\n' +
                '• Adjust your chair and monitor height\n' +
                '• Keep your feet flat on the ground\n' +
                '• Take a moment to stretch if needed',
        type: this.postureNotificationType as any,
        sound: this.postureEnableSound ? 'alert' : 'none',
        actions: [
          { title: 'I\'m Sitting Correctly', action: 'thanks', isPrimary: true },
          { title: `Snooze (${this.postureSnoozeDuration / 60} min)`, action: 'snooze' },
          { title: 'Disable for Today', action: 'disableToday' }
        ]
      });

      switch (selection) {
        case 'thanks':
          this.lastPostureCheck = now;
          vscode.window.showInformationMessage('Great! Maintaining good posture helps prevent back and neck pain.');
          break;
          
        case 'snooze':
          this.postureSnoozedUntil = now + (this.postureSnoozeDuration * 1000);
          vscode.window.showInformationMessage(
            `Posture reminder snoozed for ${this.postureSnoozeDuration / 60} minutes.`
          );
          break;
          
        case 'disableToday':
          // Snooze until tomorrow
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          tomorrow.setHours(0, 0, 0, 0);
          this.postureSnoozedUntil = tomorrow.getTime();
          vscode.window.showInformationMessage('Posture reminders disabled for today.');
          break;
      }
    }
  }

  private async checkEyeStrainReminder() {
    const now = Date.now();
    
    // Check if eye strain reminders are enabled and not snoozed
    if (!this.eyeStrainEnabled || 
        this.eyeStrainInterval <= 0 || 
        !this.isActive || 
        now < this.eyeStrainSnoozedUntil) {
      return;
    }

    const timeSinceLastBreak = (now - this.lastEyeStrainBreak) / 1000; // in seconds

    if (timeSinceLastBreak >= this.eyeStrainInterval) {
      // Don't show if we're in the middle of a break
      if (this.eyeExerciseTimer) {
        return;
      }

      const notification = NotificationManager.getInstance();
      const minutes = Math.floor(timeSinceLastBreak / 60);
      
      const selection = await notification.showNotificationCard({
        title: '👀 Time for an Eye Break',
        message: `You've been looking at the screen for ${minutes} minutes.\n\n` +
                '**Follow the 20-20-20 rule**:\n' +
                '• Every 20 minutes\n' +
                '• Look at something 20 feet away\n' +
                '• For 20 seconds\n\n' +
                'This helps prevent digital eye strain and keeps your eyes healthy.',
        type: this.eyeStrainNotificationType as any,
        sound: this.eyeStrainEnableSound ? 'alert' : 'none',
        actions: [
          { title: 'Start 20-20-20 Timer', action: 'startTimer', isPrimary: true },
          { title: `Snooze (${this.eyeStrainSnoozeDuration / 60} min)`, action: 'snooze' },
          { title: 'Disable for Today', action: 'disableToday' }
        ]
      });

      switch (selection) {
        case 'startTimer':
          this.showEyeExerciseTimer();
          this.lastEyeStrainBreak = now;
          break;
          
        case 'snooze':
          this.eyeStrainSnoozedUntil = now + (this.eyeStrainSnoozeDuration * 1000);
          vscode.window.showInformationMessage(
            `Eye strain reminder snoozed for ${this.eyeStrainSnoozeDuration / 60} minutes.`
          );
          break;
          
        case 'disableToday':
          // Snooze until tomorrow
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          tomorrow.setHours(0, 0, 0, 0);
          this.eyeStrainSnoozedUntil = tomorrow.getTime();
          vscode.window.showInformationMessage('Eye strain reminders disabled for today.');
          break;
      }
    }
  }

  private async showBreakTimer(durationInSeconds: number) {
    const startTime = Date.now();
    const endTime = startTime + durationInSeconds * 1000;
    const notification = NotificationManager.getInstance();

    // Show initial notification
    await notification.showNotificationCard({
      title: 'Break Time!',
      message: 'Time to take a short break. Stretch, walk around, or rest your eyes.',
      type: 'success',
      sound: 'success',
      actions: [
        { title: 'End Break Early', action: 'endBreak', isPrimary: true },
        { title: 'Snooze 5 min', action: 'snooze' }
      ]
    });

    // Create status bar item
    this.breakStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 10);
    this.breakStatusBarItem.show();

    const updateTimer = async () => {
      const now = Date.now();
      const remainingMs = endTime - now;
      const remainingSeconds = Math.ceil(remainingMs / 1000);
      const progress = Math.max(0, Math.min(100, 100 - (remainingMs / (durationInSeconds * 1000)) * 100));
      
      if (now >= endTime || remainingSeconds <= 0) {
        this.breakStatusBarItem?.dispose();
        this.breakStatusBarItem = undefined;
        
        await notification.showNotificationCard({
          title: 'Break Time Over',
          message: 'Your break is complete. Ready to get back to work?',
          type: 'info',
          sound: 'alert',
          actions: [
            { title: 'Back to Work', action: 'resume', isPrimary: true }
          ]
        });
        
        return;
      }

      // Update status bar
      const minutes = Math.floor(remainingSeconds / 60);
      const seconds = remainingSeconds % 60;
      
      this.breakStatusBarItem!.text = `$(clock) Break: ${minutes}:${seconds.toString().padStart(2, '0')}`;
      this.breakStatusBarItem!.tooltip = 'Taking a short break...';
      this.breakStatusBarItem!.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
      
      // Update notification with progress
      if (this.breakStatusBarItem) {
        this.breakStatusBarItem.text = `$(clock) Break: ${minutes}:${seconds.toString().padStart(2, '0')} (${Math.round(progress)}%)`;
      }
      
      // Schedule next update
      if (this.breakTimer) {
        clearTimeout(this.breakTimer);
      }
      this.breakTimer = setTimeout(updateTimer, 1000);
    };

    updateTimer();
  }

  private showEyeExerciseTimer() {
    this.lastEyeStrainBreak = Date.now();
    
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    let secondsLeft = 20;
    
    statusBarItem.text = `$(eye) Look away: ${secondsLeft}s`;
    statusBarItem.show();

    const timer = setInterval(() => {
      secondsLeft--;
      
      if (secondsLeft <= 0) {
        clearInterval(timer);
        statusBarItem.dispose();
        vscode.window.showInformationMessage('Great job! Your eyes thank you.');
        return;
      }
      
      statusBarItem.text = `$(eye) Look away: ${secondsLeft}s`;
    }, 1000);
  }

  private formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  public dispose() {
    this.clearTimers();
    this.disposables.forEach(d => d.dispose());
    this.disposables = [];
  }
}
