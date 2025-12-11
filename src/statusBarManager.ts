import * as vscode from 'vscode';
import { MetricsService } from './services/MetricsService';
import { FileSessionTracker } from './services/FileSessionTracker';

interface StatusBarItems {
    activity: vscode.StatusBarItem;
    sessionTimer: vscode.StatusBarItem;
    todaySummary: vscode.StatusBarItem;
    codeMetrics: vscode.StatusBarItem;
    pomodoro: vscode.StatusBarItem;
}

export class StatusBarManager {
    private static instance: StatusBarManager;
    private statusBarItems: StatusBarItems;
    private sessionStartTime: Date | null = null;
    private isActive = false;
    private pomodoroInterval: NodeJS.Timeout | null = null;
    private pomodoroEndTime: Date | null = null;
    private pomodoroState: 'work' | 'shortBreak' | 'longBreak' = 'work';
    private pomodoroSessionsCompleted = 0;
    private lastActiveTime: Date | null = null;
    private idleTime = 0; // Total idle time in milliseconds
    private updateInterval: NodeJS.Timeout | null = null;
    private fileSessionTracker: FileSessionTracker | null = null;
    private pomodoroConfig = {
        workDuration: 25,
        shortBreakDuration: 5,
        longBreakDuration: 15,
        sessionsBeforeLongBreak: 4,
        autoStartNext: true
    };
    private pomodoroTimeLeft = 0;
    private isPomodoroRunning = false;
    private isBreakTime = false;
    private lastResetDate: Date | null = null;

    private constructor(private context: vscode.ExtensionContext) {

        // Initialize last reset date
        this.lastResetDate = new Date();
        this.lastResetDate.setHours(0, 0, 0, 0);

        try {
            this.loadPomodoroConfig();

            // Create status bar items with higher priority (lower number = higher priority)

            this.statusBarItems = {
                activity: vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 5),
                sessionTimer: vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 4),
                todaySummary: vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 3),
                codeMetrics: vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 2),
                pomodoro: vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1)
            };

            // Initialize status bar items

            this.initializeStatusBarItems();

            // Check for day change periodically (every 5 minutes)
            setInterval(() => this.checkForDayChange(), 5 * 60 * 1000);

            // Listen for configuration changes
            context.subscriptions.push(
                vscode.workspace.onDidChangeConfiguration(e => {
                    if (e.affectsConfiguration('devtimetracker.pomodoro')) {

                        this.loadPomodoroConfig();

                        // If pomodoro is running, offer to restart
                        if (this.isPomodoroRunning) {
                            vscode.window.showInformationMessage(
                                'Pomodoro settings updated. Changes will apply to the next session.',
                                'Restart Now'
                            ).then(selection => {
                                if (selection === 'Restart Now') {
                                    this.stopPomodoro();
                                    this.startPomodoro();
                                }
                            });
                        } else {
                            // Update the display with new config values
                            this.updatePomodoroDisplay();
                        }
                    }
                })
            );
        } catch (error) {

            throw error;
        }
    }

    /**
   * Gets the current Pomodoro state
   * @returns An object containing Pomodoro state information
   */
  public getPomodoroState() {
    return {
      isRunning: this.isPomodoroRunning,
      isBreakTime: this.isBreakTime,
      timeLeft: this.pomodoroTimeLeft,
      state: this.pomodoroState,
      sessionsCompleted: this.pomodoroSessionsCompleted
    };
  }

  public static getInstance(context?: vscode.ExtensionContext): StatusBarManager | null {

    try {
      if (!StatusBarManager.instance && context) {

        StatusBarManager.instance = new StatusBarManager(context);

        // Register commands

        const commands = [
          vscode.commands.registerCommand('devtimetracker.togglePomodoro', () => {

            if (StatusBarManager.instance) {
              StatusBarManager.instance.togglePomodoro();
            } else {

            }
          }),
          // Add command to get Pomodoro state
          vscode.commands.registerCommand('devtimetracker.getPomodoroState', () => {
            return StatusBarManager.instance?.getPomodoroState();
          })
        ];

        context.subscriptions.push(...commands);

      } else if (!StatusBarManager.instance) {

        return null;
      }

      return StatusBarManager.instance;
    } catch (error) {

      return null;
    }
  }

    private initializeStatusBarItems(): void {

        try {
            // Activity indicator
            this.statusBarItems.activity.text = '$(circle-outline) Idle';
            this.statusBarItems.activity.tooltip = 'Current activity status';
            this.statusBarItems.activity.command = 'devtimetracker.showStatus';
            this.statusBarItems.activity.show();

            // Session timer
            this.statusBarItems.sessionTimer.text = '$(watch) 0m 0s';
            this.statusBarItems.sessionTimer.tooltip = 'Current coding session duration';
            this.statusBarItems.sessionTimer.command = 'devtimetracker.showStatus';
            this.statusBarItems.sessionTimer.show();

            // Today's summary
            this.statusBarItems.todaySummary.text = '$(calendar) Today: 0m';
            this.statusBarItems.todaySummary.tooltip = 'Total coding time today';
            this.statusBarItems.todaySummary.command = 'devtimetracker.showStatus';
            this.statusBarItems.todaySummary.show();

            // Code metrics
            this.statusBarItems.codeMetrics.text = '$(graph) Lines: +0/-0';
            this.statusBarItems.codeMetrics.tooltip = 'Code metrics for today';
            this.statusBarItems.codeMetrics.command = 'devtimetracker.showStatus';
            this.statusBarItems.codeMetrics.show();

            // Pomodoro timer - use actual config value
            const workMins = this.pomodoroConfig.workDuration;
            this.statusBarItems.pomodoro.text = `$(clock) Pomodoro: ${workMins.toString().padStart(2, '0')}:00`;
            this.statusBarItems.pomodoro.tooltip = 'Click to start Pomodoro';
            this.statusBarItems.pomodoro.command = 'devtimetracker.togglePomodoro';
            this.statusBarItems.pomodoro.show();

        } catch (error) {

        }
    }

    public updateActivityStatus(isActive: boolean): void {

        try {
            this.isActive = isActive;
            if (isActive) {
                // Active state - green background with white text
                this.statusBarItems.activity.text = '$(check) Active';
                this.statusBarItems.activity.backgroundColor = new vscode.ThemeColor('statusBar.debuggingBackground');
                this.statusBarItems.activity.color = new vscode.ThemeColor('statusBar.debuggingForeground');
                this.statusBarItems.activity.tooltip = 'You are actively coding';

                if (!this.sessionStartTime) {
                    this.startNewSession();
                }
            } else {
                // Idle state - default colors with a subtle gray
                this.statusBarItems.activity.text = '$(circle-outline) Idle';
                this.statusBarItems.activity.backgroundColor = new vscode.ThemeColor('statusBar.background');
                this.statusBarItems.activity.color = new vscode.ThemeColor('statusBar.foreground');
                this.statusBarItems.activity.tooltip = 'Waiting for activity...';

                // Ensure update interval is running even when idle
                if (!this.updateInterval && !this.sessionStartTime) {
                    this.startNewSession();
                }
            }
        } catch (error) {

        }
    }

    /**
     * Set the FileSessionTracker for instant idle detection
     */
    public setFileSessionTracker(tracker: FileSessionTracker): void {
        this.fileSessionTracker = tracker;
    }

    private startNewSession(): void {
        this.sessionStartTime = new Date();
        this.lastActiveTime = new Date();
        this.idleTime = 0;
        console.log(`[StatusBar] New session started at ${this.sessionStartTime.toISOString()}`);

        // Clear any existing interval
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }

        // Update timers every second
        this.updateInterval = setInterval(() => {
            if (!this.sessionStartTime) return;

            try {
                const now = new Date();

                // Check FileSessionTracker for instant idle detection (3 seconds)
                // This gives us more accurate idle status than the old method
                const hasRecentActivity = this.fileSessionTracker?.hasRecentActivity() ?? false;

                // Update active status based on FileSessionTracker
                if (hasRecentActivity !== this.isActive) {
                    this.updateActivityStatus(hasRecentActivity);
                }

                let activeTime = now.getTime() - this.sessionStartTime.getTime() - this.idleTime;

                // If we're currently active, update the last active time
                if (this.isActive) {
                    this.lastActiveTime = now;
                } else if (this.lastActiveTime) {
                    // If we're idle, accumulate idle time
                    this.idleTime = now.getTime() - this.lastActiveTime.getTime();
                }

                // Calculate display time (total time - idle time)
                const diffMs = Math.max(0, now.getTime() - this.sessionStartTime.getTime() - this.idleTime);
                const diffMins = Math.floor(diffMs / 60000);
                const diffSecs = Math.floor((diffMs % 60000) / 1000);
                const hours = Math.floor(diffMins / 60);
                const minutes = diffMins % 60;

                // Format time as HH:MM:SS if more than an hour, otherwise MM:SS
                let timeStr;
                if (hours > 0) {
                    timeStr = `${hours}h ${minutes.toString().padStart(2, '0')}m`;
                } else {
                    timeStr = `${minutes}m ${diffSecs.toString().padStart(2, '0')}s`;
                }

                this.statusBarItems.sessionTimer.text = `$(watch) ${timeStr}`;
                this.statusBarItems.sessionTimer.tooltip = `Coding session: ${timeStr}${!this.isActive ? ' (Paused)' : ''}`;

                // Update today's summary
                this.statusBarItems.todaySummary.text = `$(calendar) Today: ${timeStr}`;
                this.statusBarItems.todaySummary.tooltip = `Total coding time today: ${timeStr}${!this.isActive ? ' (Paused)' : ''}`;

                // Update code metrics
                this.updateCodeMetrics();
            } catch (error) {

            }
        }, 1000);
    }

    private updateCodeMetrics(): void {
        try {
            const metricsService = MetricsService.getInstance();
            const metrics = metricsService.getMetrics();

            if (metrics && metrics.code) {
                const linesAdded = metrics.code.lines.added || 0;
                const linesRemoved = metrics.code.lines.removed || 0;
                const fileTypes = Object.keys(metrics.code.fileTypes || {}).length;

                this.statusBarItems.codeMetrics.text = `$(graph) Lines: +${linesAdded}/-${linesRemoved} | Files: ${fileTypes} types`;
                this.statusBarItems.codeMetrics.tooltip = `Code Metrics:\nLines Added: ${linesAdded}\nLines Removed: ${linesRemoved}\nFile Types: ${fileTypes}`;
            }
        } catch (error) {
            // Metrics service might not be initialized yet, that's okay
        }
    }

    private updateSessionTimer(): void {
        if (!this.sessionStartTime) return;

        // Check if we need to reset for a new day
        this.checkForDayChange();

        const now = new Date();
        const diffMs = now.getTime() - this.sessionStartTime.getTime() - this.idleTime;
        const diffMins = Math.floor(diffMs / 60000);
        const diffSecs = Math.floor((diffMs % 60000) / 1000);
        const hours = Math.floor(diffMins / 60);
        const minutes = diffMins % 60;

        // Format time as HH:MM:SS if more than an hour, otherwise MM:SS
        let timeStr;
        if (hours > 0) {
            timeStr = `${hours}h ${minutes.toString().padStart(2, '0')}m`;
        } else {
            timeStr = `${minutes}m ${diffSecs.toString().padStart(2, '0')}s`;
        }

        this.statusBarItems.sessionTimer.text = `$(watch) ${timeStr}`;
        this.statusBarItems.sessionTimer.tooltip = `Coding session: ${timeStr}${!this.isActive ? ' (Paused)' : ''}`;

        // Update today's summary
        this.statusBarItems.todaySummary.text = `$(calendar) Today: ${timeStr}`;
        this.statusBarItems.todaySummary.tooltip = `Total coding time today: ${timeStr}${!this.isActive ? ' (Paused)' : ''}`;
    }

    private checkForDayChange(): void {
        try {
            const now = new Date();
            const lastReset = this.lastResetDate || new Date(0);

            // Check if we've crossed midnight since the last reset
            if (now.getDate() !== lastReset.getDate() ||
                now.getMonth() !== lastReset.getMonth() ||
                now.getFullYear() !== lastReset.getFullYear()) {

                // Reset the last reset date to today
                this.lastResetDate = new Date();
                this.lastResetDate.setHours(0, 0, 0, 0);

                // Reset daily counters
                if (this.sessionStartTime) {
                    // Reset session start time to today
                    this.sessionStartTime = new Date();
                    this.idleTime = 0;

                    // Update the display to reflect the reset
                    this.updateSessionTimer();
                }
            }
        } catch (error) {

        }
    }

    private updateTodaySummary(additionalMinutes: number): void {
        // In a real implementation, you would load this from persistent storage
        // For now, we'll just show the current session time
        this.statusBarItems.todaySummary.text = `$(calendar) Today: ${additionalMinutes}m`;
    }

    public togglePomodoro(): void {
        if (this.isPomodoroRunning) {
            this.stopPomodoro();
        } else {
            this.startPomodoro();
        }
    }

    private loadPomodoroConfig(): void {
        const config = vscode.workspace.getConfiguration('devtimetracker.pomodoro');
        const previousWorkDuration = this.pomodoroConfig.workDuration;

        this.pomodoroConfig = {
            workDuration: config.get<number>('workDuration') || 25,
            shortBreakDuration: config.get<number>('shortBreakDuration') || 5,
            longBreakDuration: config.get<number>('longBreakDuration') || 15,
            sessionsBeforeLongBreak: config.get<number>('sessionsBeforeLongBreak') || 4,
            autoStartNext: config.get<boolean>('autoStartNextSession') !== false
        };

        // If config changed and Pomodoro is not running, reset the display
        if (!this.isPomodoroRunning && previousWorkDuration !== this.pomodoroConfig.workDuration) {
            this.pomodoroTimeLeft = this.pomodoroConfig.workDuration * 60;
        }
    }

    private startPomodoro(): void {
        this.isPomodoroRunning = true;

        // Determine if we're starting a work session or a break
        if (!this.isBreakTime) {
            // Starting a work session
            this.pomodoroTimeLeft = this.pomodoroConfig.workDuration * 60;
            console.log(`[Pomodoro] Starting work session (${this.pomodoroConfig.workDuration} minutes)`);
        } else {
            // Starting a break (short or long)
            const isLongBreak = this.pomodoroSessionsCompleted > 0 &&
                              this.pomodoroSessionsCompleted % this.pomodoroConfig.sessionsBeforeLongBreak === 0;

            const breakDuration = isLongBreak
                ? this.pomodoroConfig.longBreakDuration
                : this.pomodoroConfig.shortBreakDuration;

            this.pomodoroTimeLeft = breakDuration * 60;
            console.log(`[Pomodoro] Starting ${isLongBreak ? 'long' : 'short'} break (${breakDuration} minutes)`);
        }

        // Clear any existing interval
        if (this.pomodoroInterval) {
            clearInterval(this.pomodoroInterval);
        }

        // Start the countdown
        this.pomodoroInterval = setInterval(() => {
            this.pomodoroTimeLeft--;
            this.updatePomodoroDisplay();

            if (this.pomodoroTimeLeft <= 0) {
                this.pomodoroTimeEnded();
            }
        }, 1000);

        this.updatePomodoroDisplay();
    }

    private stopPomodoro(): void {
        if (this.pomodoroInterval) {
            clearInterval(this.pomodoroInterval);
            this.pomodoroInterval = null;
        }
        this.isPomodoroRunning = false;
        this.statusBarItems.pomodoro.text = '$(clock) Pomodoro: Start';
        this.statusBarItems.pomodoro.tooltip = 'Click to start Pomodoro';
    }

    private updatePomodoroDisplay(): void {
        // If not running, show the start button
        if (!this.isPomodoroRunning) {
            const nextMode = this.isBreakTime ? 'Break' : 'Work';
            this.statusBarItems.pomodoro.text = '$(play) Start Pomodoro';
            this.statusBarItems.pomodoro.tooltip = `Click to start ${nextMode} session`;
            return;
        }

        const minutes = Math.floor(this.pomodoroTimeLeft / 60);
        const seconds = this.pomodoroTimeLeft % 60;
        const timeStr = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

        const mode = this.isBreakTime ? 'Break' : 'Work';
        const progress = this.getPomodoroProgress();
        this.statusBarItems.pomodoro.text = `$(clock) ${mode}: ${timeStr} ${progress}`;
        this.statusBarItems.pomodoro.tooltip = `Click to stop ${mode} timer`;
    }

    private pomodoroTimeEnded(): void {
        if (this.pomodoroInterval) {
            clearInterval(this.pomodoroInterval);
            this.pomodoroInterval = null;
        }

        if (this.isBreakTime) {
            // Break ended, start a work session
            this.isBreakTime = false;
            const message = 'Break time is over! Time to focus.';
            // Show notification in status bar instead of popup
            const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
            statusBarItem.text = `$(info) ${message}`;
            statusBarItem.show();

            // Auto-hide after 5 seconds
            setTimeout(() => {
                statusBarItem.dispose();
            }, 5000);

            if (this.pomodoroConfig.autoStartNext) {
                this.startPomodoro();
            } else {
                this.updatePomodoroDisplay();
            }
        } else {
            // Work session ended, take a break
            this.isBreakTime = true;
            this.pomodoroSessionsCompleted++;

            const isLongBreak = this.pomodoroSessionsCompleted > 0 &&
                              this.pomodoroSessionsCompleted % this.pomodoroConfig.sessionsBeforeLongBreak === 0;

            const breakDuration = isLongBreak
                ? this.pomodoroConfig.longBreakDuration
                : this.pomodoroConfig.shortBreakDuration;

            const message = isLongBreak
                ? `Pomodoro session complete! Time for a long ${breakDuration}-minute break.`
                : `Pomodoro session complete! Time for a ${breakDuration}-minute break.`;

            // Show notification in status bar instead of popup
            const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
            statusBarItem.text = `$(info) ${message}`;
            statusBarItem.show();

            // Auto-hide after 5 seconds
            setTimeout(() => {
                statusBarItem.dispose();
            }, 5000);

            if (this.pomodoroConfig.autoStartNext) {
                this.startPomodoro();
            } else {
                this.updatePomodoroDisplay();
            }
        }
    }

    private getPomodoroProgress(): string {
        if (!this.isPomodoroRunning) return '';

        if (this.isBreakTime) {
            const isLongBreak = this.pomodoroSessionsCompleted > 0 &&
                              this.pomodoroSessionsCompleted % this.pomodoroConfig.sessionsBeforeLongBreak === 0;
            return isLongBreak ? '(Long Break)' : '(Short Break)';
        } else {
            const sessionNumber = (this.pomodoroSessionsCompleted % this.pomodoroConfig.sessionsBeforeLongBreak) + 1;
            return `(${sessionNumber}/${this.pomodoroConfig.sessionsBeforeLongBreak})`;
        }
    }

    public getSessionTime(): string {
        if (!this.sessionStartTime) return '0m';
        const seconds = Math.floor((Date.now() - this.sessionStartTime.getTime()) / 1000);
        const minutes = Math.floor(seconds / 60);
        return `${minutes}m`;
    }

    public getTodayTime(): string {
        // For now, just return the session time
        // In a real implementation, this would load from persistent storage
        return this.getSessionTime();
    }

    public dispose(): void {

        // Clean up all status bar items
        Object.values(this.statusBarItems).forEach(item => {
            try {
                item.dispose();
            } catch (error) {

            }
        });

        // Clear any active intervals
        if (this.pomodoroInterval) {
            clearInterval(this.pomodoroInterval);
            this.pomodoroInterval = null;
        }
    }
}
