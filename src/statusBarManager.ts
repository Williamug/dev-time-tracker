import * as vscode from 'vscode';
import { MetricsService } from './services/MetricsService';
import { FileSessionTracker } from './services/FileSessionTracker';

interface StatusBarItems {
    activity: vscode.StatusBarItem;
    sessionTimer: vscode.StatusBarItem;
    todaySummary: vscode.StatusBarItem;
    codeMetrics: vscode.StatusBarItem;
    pomodoro: vscode.StatusBarItem;
    syncQueue: vscode.StatusBarItem;
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
    private totalIdleTime = 0; // Total idle time for the day (cumulative)
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

        // Load persisted session data
        this.loadPersistedSession();

        try {
            this.loadPomodoroConfig();

            // Create status bar items with higher priority (lower number = higher priority)

            this.statusBarItems = {
                activity: vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 5),
                sessionTimer: vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 4),
                todaySummary: vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 3),
                codeMetrics: vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 2),
                pomodoro: vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1),
                syncQueue: vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 6)
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
     * Load persisted session data from storage
     */
    private async loadPersistedSession(): Promise<void> {
        try {
            const savedDate = this.context.globalState.get<string>('sessionDate');
            const today = new Date().toDateString();

            // Only load if it's from today
            if (savedDate === today) {
                const savedStartTime = this.context.globalState.get<string>('sessionStartTime');
                const savedIdleTime = this.context.globalState.get<number>('totalIdleTime', 0);

                if (savedStartTime) {
                    this.sessionStartTime = new Date(savedStartTime);
                    this.totalIdleTime = savedIdleTime;
                    this.idleTime = 0; // Current idle period resets

                    // Start the update interval for the persisted session
                    this.startUpdateInterval();
                }
            } else {
                // Clear old session data
                await this.context.globalState.update('sessionDate', undefined);
                await this.context.globalState.update('sessionStartTime', undefined);
                await this.context.globalState.update('totalIdleTime', undefined);
            }
        } catch (error) {
            // Silently fail - will start fresh session
        }
    }

    /**
     * Persist session data to storage
     */
    private async persistSession(): Promise<void> {
        try {
            const today = new Date().toDateString();
            await this.context.globalState.update('sessionDate', today);
            await this.context.globalState.update('sessionStartTime', this.sessionStartTime?.toISOString());
            await this.context.globalState.update('totalIdleTime', this.totalIdleTime);
        } catch (error) {
            // Silently fail
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

            // Sync queue status - initially hidden
            this.statusBarItems.syncQueue.text = '$(sync) Synced';
            this.statusBarItems.syncQueue.tooltip = 'All activities synced';
            this.statusBarItems.syncQueue.hide(); // Hidden by default

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
        // Don't reset totalIdleTime - it persists for the day

        // Persist the new session
        this.persistSession();

        // Start the update interval
        this.startUpdateInterval();
    }

    private startUpdateInterval(): void {
        // Clear any existing interval
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }

        // Update timers every second
        this.updateInterval = setInterval(() => {
            if (!this.sessionStartTime) return;

            try {
                const now = new Date();

                // Check FileSessionTracker for instant idle detection (10 seconds)
                // This gives us more accurate idle status than the old method
                const hasRecentActivity = this.fileSessionTracker?.hasRecentActivity() ?? false;

                // Update active status based on FileSessionTracker
                if (hasRecentActivity !== this.isActive) {
                    this.updateActivityStatus(hasRecentActivity);
                }

                // If we're currently active, update the last active time
                if (this.isActive) {
                    // If transitioning from idle to active, add the idle period to total
                    if (this.idleTime > 0) {
                        this.totalIdleTime += this.idleTime;
                        this.idleTime = 0;
                        this.persistSession(); // Fire and forget
                    }
                    this.lastActiveTime = now;
                } else if (this.lastActiveTime) {
                    // If we're idle, calculate current idle period (don't overwrite!)
                    this.idleTime = now.getTime() - this.lastActiveTime.getTime();
                }

                // Calculate display time (total time - all idle time)
                const totalIdleMs = this.totalIdleTime + this.idleTime;
                const diffMs = Math.max(0, now.getTime() - this.sessionStartTime.getTime() - totalIdleMs);
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
                const idleMins = Math.floor(totalIdleMs / 60000);
                const idleTooltip = idleMins > 0 ? ` | Idle: ${idleMins}m` : '';
                this.statusBarItems.sessionTimer.tooltip = `Coding session: ${timeStr}${!this.isActive ? ' (Paused)' : ''}${idleTooltip}`;

                // Update today's summary
                this.statusBarItems.todaySummary.text = `$(calendar) Today: ${timeStr}`;
                this.statusBarItems.todaySummary.tooltip = `Total coding time today: ${timeStr}${!this.isActive ? ' (Paused)' : ''}${idleTooltip}`;

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
        const totalIdleMs = this.totalIdleTime + this.idleTime;
        const diffMs = now.getTime() - this.sessionStartTime.getTime() - totalIdleMs;
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
                    this.totalIdleTime = 0;

                    // Persist the reset
                    this.persistSession(); // Fire and forget

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

        // Get config values and ensure they're numbers
        const workDuration = config.get<number>('workDuration');
        const shortBreakDuration = config.get<number>('shortBreakDuration');
        const longBreakDuration = config.get<number>('longBreakDuration');
        const sessionsBeforeLongBreak = config.get<number>('sessionsBeforeLongBreak');
        const autoStartNext = config.get<boolean>('autoStartNextSession');

        this.pomodoroConfig = {
            workDuration: Number(workDuration) || 25,
            shortBreakDuration: Number(shortBreakDuration) || 5,
            longBreakDuration: Number(longBreakDuration) || 15,
            sessionsBeforeLongBreak: Number(sessionsBeforeLongBreak) || 4,
            autoStartNext: autoStartNext !== false
        };

        // Initialize pomodoroTimeLeft with work duration when first loaded
        if (this.pomodoroTimeLeft === 0) {
            this.pomodoroTimeLeft = this.pomodoroConfig.workDuration * 60;
        }

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
        } else {
            // Starting a break (short or long)
            const isLongBreak = this.pomodoroSessionsCompleted > 0 &&
                              this.pomodoroSessionsCompleted % this.pomodoroConfig.sessionsBeforeLongBreak === 0;

            const breakDuration = isLongBreak
                ? this.pomodoroConfig.longBreakDuration
                : this.pomodoroConfig.shortBreakDuration;

            this.pomodoroTimeLeft = breakDuration * 60;
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

        // Safety check for valid time
        if (this.pomodoroTimeLeft < 0 || !Number.isFinite(this.pomodoroTimeLeft)) {
            this.pomodoroTimeLeft = this.pomodoroConfig.workDuration * 60;
        }

        const minutes = Math.floor(this.pomodoroTimeLeft / 60);
        const seconds = this.pomodoroTimeLeft % 60;

        // Safety check for valid numbers
        const minutesStr = (Number.isFinite(minutes) ? minutes : 0).toString().padStart(2, '0');
        const secondsStr = (Number.isFinite(seconds) ? seconds : 0).toString().padStart(2, '0');
        const timeStr = `${minutesStr}:${secondsStr}`;

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

    /**
     * Update sync queue status bar with pending activities count
     * @param pendingCount Number of activities waiting to be synced
     * @param isOffline Whether the extension is offline/circuit breaker is open
     */
    public updateSyncQueueStatus(pendingCount: number, isOffline: boolean = false): void {
        try {
            if (pendingCount === 0 && !isOffline) {
                // All synced - hide the status bar item
                this.statusBarItems.syncQueue.hide();
            } else if (isOffline) {
                // Offline mode - show warning
                this.statusBarItems.syncQueue.text = `$(warning) Offline (${pendingCount} queued)`;
                this.statusBarItems.syncQueue.tooltip = `Connection issues. ${pendingCount} activities will sync when online.`;
                this.statusBarItems.syncQueue.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
                this.statusBarItems.syncQueue.color = new vscode.ThemeColor('statusBarItem.warningForeground');
                this.statusBarItems.syncQueue.show();
            } else {
                // Activities pending - show count
                this.statusBarItems.syncQueue.text = `$(cloud-upload) ${pendingCount} queued`;
                this.statusBarItems.syncQueue.tooltip = `${pendingCount} activities waiting to sync`;
                this.statusBarItems.syncQueue.backgroundColor = undefined;
                this.statusBarItems.syncQueue.color = undefined;
                this.statusBarItems.syncQueue.show();
            }
        } catch (error) {
            // Silently fail
        }
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
