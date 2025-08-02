"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.StatusBarManager = void 0;
const vscode = __importStar(require("vscode"));
class StatusBarManager {
    context;
    static instance;
    statusBarItems;
    sessionStartTime = null;
    isActive = false;
    pomodoroInterval = null;
    pomodoroEndTime = null;
    pomodoroState = 'work';
    pomodoroSessionsCompleted = 0;
    lastActiveTime = null;
    idleTime = 0; // Total idle time in milliseconds
    updateInterval = null;
    pomodoroConfig = {
        workDuration: 25,
        shortBreakDuration: 5,
        longBreakDuration: 15,
        sessionsBeforeLongBreak: 4,
        autoStartNext: true
    };
    pomodoroTimeLeft = 0;
    isPomodoroRunning = false;
    isBreakTime = false;
    lastResetDate = null;
    constructor(context) {
        this.context = context;
        console.log('[StatusBar] Creating new StatusBarManager instance');
        // Initialize last reset date
        this.lastResetDate = new Date();
        this.lastResetDate.setHours(0, 0, 0, 0);
        try {
            this.loadPomodoroConfig();
            console.log('[StatusBar] Pomodoro config loaded');
            // Create status bar items with higher priority (lower number = higher priority)
            console.log('[StatusBar] Creating status bar items');
            this.statusBarItems = {
                activity: vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 4),
                sessionTimer: vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 3),
                todaySummary: vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 2),
                pomodoro: vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1)
            };
            console.log('[StatusBar] Status bar items created');
            // Initialize status bar items
            console.log('[StatusBar] Initializing status bar items');
            this.initializeStatusBarItems();
            console.log('[StatusBar] Status bar items initialized');
            // Check for day change periodically (every 5 minutes)
            setInterval(() => this.checkForDayChange(), 5 * 60 * 1000);
        }
        catch (error) {
            console.error('[StatusBar] Error during initialization:', error);
            throw error;
        }
    }
    /**
   * Gets the current Pomodoro state
   * @returns An object containing Pomodoro state information
   */
    getPomodoroState() {
        return {
            isRunning: this.isPomodoroRunning,
            isBreakTime: this.isBreakTime,
            timeLeft: this.pomodoroTimeLeft,
            state: this.pomodoroState,
            sessionsCompleted: this.pomodoroSessionsCompleted
        };
    }
    static getInstance(context) {
        console.log('[StatusBar] Getting StatusBarManager instance');
        try {
            if (!StatusBarManager.instance && context) {
                console.log('[StatusBar] Creating new instance');
                StatusBarManager.instance = new StatusBarManager(context);
                // Register commands
                console.log('[StatusBar] Registering commands');
                const commands = [
                    vscode.commands.registerCommand('devtimetracker.togglePomodoro', () => {
                        console.log('[StatusBar] Toggle Pomodoro command triggered');
                        if (StatusBarManager.instance) {
                            StatusBarManager.instance.togglePomodoro();
                        }
                        else {
                            console.error('[StatusBar] No instance available for togglePomodoro');
                        }
                    }),
                    // Add command to get Pomodoro state
                    vscode.commands.registerCommand('devtimetracker.getPomodoroState', () => {
                        return StatusBarManager.instance?.getPomodoroState();
                    })
                ];
                context.subscriptions.push(...commands);
                console.log('[StatusBar] Commands registered');
            }
            else if (!StatusBarManager.instance) {
                console.error('[StatusBar] No context provided for first-time initialization');
                return null;
            }
            return StatusBarManager.instance;
        }
        catch (error) {
            console.error('[StatusBar] Error getting StatusBarManager instance:', error);
            return null;
        }
    }
    initializeStatusBarItems() {
        console.log('[StatusBar] Initializing status bar items');
        try {
            // Activity indicator
            this.statusBarItems.activity.text = '$(circle-outline) Idle';
            this.statusBarItems.activity.tooltip = 'Current activity status';
            this.statusBarItems.activity.command = 'devtimetracker.showStatus';
            this.statusBarItems.activity.show();
            console.log('[StatusBar] Activity indicator initialized');
            // Session timer
            this.statusBarItems.sessionTimer.text = '$(watch) 0m 0s';
            this.statusBarItems.sessionTimer.tooltip = 'Current coding session duration';
            this.statusBarItems.sessionTimer.command = 'devtimetracker.showStatus';
            this.statusBarItems.sessionTimer.show();
            console.log('[StatusBar] Session timer initialized');
            // Today's summary
            this.statusBarItems.todaySummary.text = '$(calendar) Today: 0m';
            this.statusBarItems.todaySummary.tooltip = 'Total coding time today';
            this.statusBarItems.todaySummary.command = 'devtimetracker.showStatus';
            this.statusBarItems.todaySummary.show();
            console.log('[StatusBar] Today\'s summary initialized');
            // Pomodoro timer
            this.statusBarItems.pomodoro.text = '$(clock) Pomodoro: 25:00';
            this.statusBarItems.pomodoro.tooltip = 'Click to start Pomodoro';
            this.statusBarItems.pomodoro.command = 'devtimetracker.togglePomodoro';
            this.statusBarItems.pomodoro.show();
            console.log('[StatusBar] Pomodoro timer initialized');
        }
        catch (error) {
            console.error('[StatusBar] Error initializing status bar items:', error);
        }
    }
    updateActivityStatus(isActive) {
        console.log('[StatusBar] Updating activity status:', isActive ? 'Active' : 'Idle');
        try {
            this.isActive = isActive;
            if (isActive) {
                // Active state - green background with white text
                this.statusBarItems.activity.text = '$(check) Active';
                this.statusBarItems.activity.backgroundColor = new vscode.ThemeColor('statusBar.debuggingBackground');
                this.statusBarItems.activity.color = new vscode.ThemeColor('statusBar.debuggingForeground');
                this.statusBarItems.activity.tooltip = 'You are actively coding';
                if (!this.sessionStartTime) {
                    console.log('[StatusBar] Starting new session');
                    this.startNewSession();
                }
            }
            else {
                // Idle state - default colors with a subtle gray
                this.statusBarItems.activity.text = '$(circle-outline) Idle';
                this.statusBarItems.activity.backgroundColor = new vscode.ThemeColor('statusBar.background');
                this.statusBarItems.activity.color = new vscode.ThemeColor('statusBar.foreground');
                this.statusBarItems.activity.tooltip = 'Waiting for activity...';
            }
        }
        catch (error) {
            console.error('[StatusBar] Error updating activity status:', error);
        }
    }
    startNewSession() {
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
            if (!this.sessionStartTime)
                return;
            try {
                const now = new Date();
                let activeTime = now.getTime() - this.sessionStartTime.getTime() - this.idleTime;
                // If we're currently active, update the last active time
                if (this.isActive) {
                    this.lastActiveTime = now;
                }
                else if (this.lastActiveTime) {
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
                }
                else {
                    timeStr = `${minutes}m ${diffSecs.toString().padStart(2, '0')}s`;
                }
                this.statusBarItems.sessionTimer.text = `$(watch) ${timeStr}`;
                this.statusBarItems.sessionTimer.tooltip = `Coding session: ${timeStr}${!this.isActive ? ' (Paused)' : ''}`;
                // Update today's summary
                this.statusBarItems.todaySummary.text = `$(calendar) Today: ${timeStr}`;
                this.statusBarItems.todaySummary.tooltip = `Total coding time today: ${timeStr}${!this.isActive ? ' (Paused)' : ''}`;
            }
            catch (error) {
                console.error('[StatusBar] Error updating session timer:', error);
            }
        }, 1000);
    }
    updateSessionTimer() {
        if (!this.sessionStartTime)
            return;
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
        }
        else {
            timeStr = `${minutes}m ${diffSecs.toString().padStart(2, '0')}s`;
        }
        this.statusBarItems.sessionTimer.text = `$(watch) ${timeStr}`;
        this.statusBarItems.sessionTimer.tooltip = `Coding session: ${timeStr}${!this.isActive ? ' (Paused)' : ''}`;
        // Update today's summary
        this.statusBarItems.todaySummary.text = `$(calendar) Today: ${timeStr}`;
        this.statusBarItems.todaySummary.tooltip = `Total coding time today: ${timeStr}${!this.isActive ? ' (Paused)' : ''}`;
    }
    checkForDayChange() {
        try {
            const now = new Date();
            const lastReset = this.lastResetDate || new Date(0);
            // Check if we've crossed midnight since the last reset
            if (now.getDate() !== lastReset.getDate() ||
                now.getMonth() !== lastReset.getMonth() ||
                now.getFullYear() !== lastReset.getFullYear()) {
                console.log('[StatusBar] New day detected, resetting daily counters');
                // Reset the last reset date to today
                this.lastResetDate = new Date();
                this.lastResetDate.setHours(0, 0, 0, 0);
                // Reset daily counters
                if (this.sessionStartTime) {
                    // Reset session start time to today
                    this.sessionStartTime = new Date();
                    this.idleTime = 0;
                }
                // Update the display to reflect the reset
                this.updateSessionTimer();
                // Show a notification about the reset
                vscode.window.showInformationMessage('A new day has started. Your coding session timer has been reset.');
            }
        }
        catch (error) {
            console.error('[StatusBar] Error checking for day change:', error);
        }
    }
    updateTodaySummary(additionalMinutes) {
        // In a real implementation, you would load this from persistent storage
        // For now, we'll just show the current session time
        this.statusBarItems.todaySummary.text = `$(calendar) Today: ${additionalMinutes}m`;
    }
    togglePomodoro() {
        if (this.isPomodoroRunning) {
            this.stopPomodoro();
        }
        else {
            this.startPomodoro();
        }
    }
    loadPomodoroConfig() {
        const config = vscode.workspace.getConfiguration('devtimetracker.pomodoro');
        this.pomodoroConfig = {
            workDuration: config.get('workDuration') || 25,
            shortBreakDuration: config.get('shortBreakDuration') || 5,
            longBreakDuration: config.get('longBreakDuration') || 15,
            sessionsBeforeLongBreak: config.get('sessionsBeforeLongBreak') || 4,
            autoStartNext: config.get('autoStartNextSession') !== false
        };
        console.log('[Pomodoro] Loaded config:', this.pomodoroConfig);
    }
    startPomodoro() {
        this.isPomodoroRunning = true;
        // Determine if we're starting a work session or a break
        if (!this.isBreakTime) {
            // Starting a work session
            this.pomodoroTimeLeft = this.pomodoroConfig.workDuration * 60;
            console.log(`[Pomodoro] Starting work session (${this.pomodoroConfig.workDuration} minutes)`);
        }
        else {
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
    stopPomodoro() {
        if (this.pomodoroInterval) {
            clearInterval(this.pomodoroInterval);
            this.pomodoroInterval = null;
        }
        this.isPomodoroRunning = false;
        this.statusBarItems.pomodoro.text = '$(clock) Pomodoro: Start';
        this.statusBarItems.pomodoro.tooltip = 'Click to start Pomodoro';
    }
    updatePomodoroDisplay() {
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
    pomodoroTimeEnded() {
        if (this.pomodoroInterval) {
            clearInterval(this.pomodoroInterval);
            this.pomodoroInterval = null;
        }
        if (this.isBreakTime) {
            // Break ended, start a work session
            this.isBreakTime = false;
            const message = 'Break time is over! Time to focus.';
            vscode.window.showInformationMessage(message);
            if (this.pomodoroConfig.autoStartNext) {
                this.startPomodoro();
            }
            else {
                this.updatePomodoroDisplay();
            }
        }
        else {
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
            vscode.window.showInformationMessage(message);
            if (this.pomodoroConfig.autoStartNext) {
                this.startPomodoro();
            }
            else {
                this.updatePomodoroDisplay();
            }
        }
    }
    getPomodoroProgress() {
        if (!this.isPomodoroRunning)
            return '';
        if (this.isBreakTime) {
            const isLongBreak = this.pomodoroSessionsCompleted > 0 &&
                this.pomodoroSessionsCompleted % this.pomodoroConfig.sessionsBeforeLongBreak === 0;
            return isLongBreak ? '(Long Break)' : '(Short Break)';
        }
        else {
            const sessionNumber = (this.pomodoroSessionsCompleted % this.pomodoroConfig.sessionsBeforeLongBreak) + 1;
            return `(${sessionNumber}/${this.pomodoroConfig.sessionsBeforeLongBreak})`;
        }
    }
    getSessionTime() {
        if (!this.sessionStartTime)
            return '0m';
        const seconds = Math.floor((Date.now() - this.sessionStartTime.getTime()) / 1000);
        const minutes = Math.floor(seconds / 60);
        return `${minutes}m`;
    }
    getTodayTime() {
        // For now, just return the session time
        // In a real implementation, this would load from persistent storage
        return this.getSessionTime();
    }
    dispose() {
        console.log('[StatusBar] Disposing status bar items');
        // Clean up all status bar items
        Object.values(this.statusBarItems).forEach(item => {
            try {
                item.dispose();
            }
            catch (error) {
                console.error('[StatusBar] Error disposing status bar item:', error);
            }
        });
        // Clear any active intervals
        if (this.pomodoroInterval) {
            clearInterval(this.pomodoroInterval);
            this.pomodoroInterval = null;
        }
    }
}
exports.StatusBarManager = StatusBarManager;
//# sourceMappingURL=statusBarManager.js.map