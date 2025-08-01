import * as vscode from 'vscode';
import { MetricsCollector } from '../models/Metrics';
import { NotificationManager } from '../utils/NotificationManager';

export class HealthService {
  private static instance: HealthService;
  private metricsCollector = MetricsCollector.getInstance();
  private disposables: vscode.Disposable[] = [];
  private timers: NodeJS.Timeout[] = [];
  
  // Default intervals in seconds (can be overridden by settings)
  private breakReminderInterval: number;
  private postureReminderInterval: number;
  private eyeStrainInterval: number;
  private lastBreakTime: number;
  private lastPostureCheck: number;
  private lastEyeStrainBreak: number;
  private isActive: boolean;
  private breakStatusBarItem: vscode.StatusBarItem | undefined;
  private breakTimer: NodeJS.Timeout | null = null;
  private eyeExerciseTimer: NodeJS.Timeout | null = null;

  private constructor() {
    // Initialize with default values
    this.breakReminderInterval = 30 * 60; // 30 minutes
    this.postureReminderInterval = 30 * 60; // 30 minutes
    this.eyeStrainInterval = 20 * 60; // 20 minutes
    this.lastBreakTime = Date.now();
    this.lastPostureCheck = Date.now();
    this.lastEyeStrainBreak = Date.now();
    this.isActive = true;
    
    this.initialize();
  }

  public static getInstance(): HealthService {
    if (!HealthService.instance) {
      HealthService.instance = new HealthService();
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
    this.breakReminderInterval = config.get<number>('breakReminderInterval') || 30 * 60;
    this.postureReminderInterval = config.get<number>('postureReminderInterval') || 30 * 60;
    this.eyeStrainInterval = config.get<number>('eyeStrainInterval') || 20 * 60;
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

  private async checkBreakReminder() {
    if (!this.isActive || this.breakReminderInterval <= 0) return;

    const now = Date.now();
    const timeSinceLastBreak = (now - this.lastBreakTime) / 1000; // in seconds
    const minutesWorking = Math.floor(timeSinceLastBreak / 60);

    if (timeSinceLastBreak >= this.breakReminderInterval) {
      const notification = NotificationManager.getInstance();
      const selection = await notification.showNotificationCard({
        title: 'Time for a Break!',
        message: `You've been working for ${minutesWorking} minutes. ` +
                'Taking regular breaks helps maintain focus and productivity.\n\n' +
                'Consider taking a short break to stretch or rest your eyes.',
        type: 'warning',
        actions: [
          { title: 'Take 5-min Break', action: 'takeBreak' },
          { title: 'Snooze 10 min', action: 'snooze' },
          { title: 'I Took a Break', action: 'dismiss' }
        ]
      });

      if (selection === 'takeBreak') {
        this.showBreakTimer(5 * 60); // 5 minutes
      } else if (selection === 'snooze') {
        this.lastBreakTime = now + 10 * 60 * 1000; // Snooze for 10 minutes
      } else if (selection === 'dismiss') {
        this.lastBreakTime = now;
      }
    }
  }

  private async checkPostureReminder() {
    if (!this.isActive || this.postureReminderInterval <= 0) return;

    const now = Date.now();
    const timeSinceLastCheck = (now - this.lastPostureCheck) / 1000; // in seconds

    if (timeSinceLastCheck >= this.postureReminderInterval) {
      const notification = NotificationManager.getInstance();
      const selection = await notification.showNotificationCard({
        title: 'Posture Check',
        message: 'Good posture is important for long coding sessions!\n\n' +
                '• Sit up straight\n' +
                '• Keep your shoulders relaxed\n' +
                '• Adjust your chair and monitor height\n' +
                '• Keep your feet flat on the ground',
        type: 'info',
        actions: [
          { title: 'I\'m Sitting Correctly', action: 'thanks' },
          { title: 'Remind Me Later', action: 'snooze' }
        ]
      });

      if (selection === 'thanks') {
        this.lastPostureCheck = now;
      } else if (selection === 'snooze') {
        this.lastPostureCheck = now + 15 * 60 * 1000; // Remind in 15 minutes
      }
    }
  }

  private async checkEyeStrainReminder() {
    if (!this.isActive || this.eyeStrainInterval <= 0) return;

    const now = Date.now();
    const timeSinceLastBreak = (now - this.lastEyeStrainBreak) / 1000; // in seconds

    if (timeSinceLastBreak >= this.eyeStrainInterval) {
      const notification = NotificationManager.getInstance();
      const selection = await notification.showNotificationCard({
        title: 'Eye Strain Prevention',
        message: 'Give your eyes a break! Follow the 20-20-20 rule:\n\n' +
                '• Every 20 minutes\n' +
                '• Look at something 20 feet away\n' +
                '• For 20 seconds\n\n' +
                'This helps prevent digital eye strain and keeps your eyes healthy.',
        type: 'info',
        actions: [
          { title: 'Start 20-20-20 Timer', action: 'startTimer' },
          { title: 'Snooze 10 min', action: 'snooze' }
        ]
      });

      if (selection === 'startTimer') {
        this.showEyeExerciseTimer();
      } else if (selection === 'snooze') {
        this.lastEyeStrainBreak = now + 10 * 60 * 1000; // Snooze for 10 minutes
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
