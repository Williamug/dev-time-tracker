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
exports.HealthService = void 0;
const vscode = __importStar(require("vscode"));
const Metrics_1 = require("../models/Metrics");
const NotificationManager_1 = require("../utils/NotificationManager");
class HealthService {
    static instance;
    metricsCollector = Metrics_1.MetricsCollector.getInstance();
    disposables = [];
    timers = [];
    backendService = null;
    // Break reminder settings
    breakReminderInterval = 60 * 60; // 60 minutes
    breakReminderEnabled = true;
    breakSnoozeDuration = 15 * 60; // 15 minutes
    breakNotificationType = 'warning';
    breakEnableSound = true;
    breakSnoozedUntil = 0;
    // Posture reminder settings
    postureReminderInterval = 30 * 60; // 30 minutes
    postureReminderEnabled = true;
    postureSnoozeDuration = 15 * 60; // 15 minutes
    postureNotificationType = 'info';
    postureEnableSound = true;
    postureSnoozedUntil = 0;
    // Eye strain settings
    eyeStrainInterval = 20 * 60; // 20 minutes
    eyeStrainEnabled = true;
    eyeStrainSnoozeDuration = 10 * 60; // 10 minutes
    eyeStrainNotificationType = 'info';
    eyeStrainEnableSound = true;
    lastBreakTime;
    lastPostureCheck;
    lastEyeStrainBreak;
    isActive;
    breakStatusBarItem;
    breakTimer = null;
    eyeExerciseTimer = null;
    eyeStrainSnoozedUntil = 0;
    constructor(backendService) {
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
    static getInstance(backendService) {
        if (!HealthService.instance) {
            HealthService.instance = new HealthService(backendService);
        }
        else if (backendService) {
            // Update backend service reference if provided
            HealthService.instance.backendService = backendService;
        }
        return HealthService.instance;
    }
    initialize() {
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
    loadConfig() {
        const config = vscode.workspace.getConfiguration('devtimetracker.health');
        // Break reminder settings with all configuration options
        this.breakReminderInterval = config.get('breakReminderInterval') ?? 60 * 60;
        this.breakReminderEnabled = config.get('breakReminderEnabled') ?? true;
        this.breakSnoozeDuration = config.get('breakSnoozeDuration') ?? 15 * 60;
        // Handle all notification type configurations with fallbacks
        this.breakNotificationType = (config.get('breakNotificationType') ||
            config.get('breakReminderNotificationType') ||
            config.get('breakReminderType') ||
            'info');
        // Handle all sound configurations with fallbacks
        this.breakEnableSound = config.get('breakEnableSound') ??
            config.get('breakReminderSound') ??
            true;
        // Get sound file and volume if needed (for future use)
        const breakSoundFile = config.get('breakReminderSoundFile') || 'default';
        const breakSoundVolume = config.get('breakReminderSoundVolume') ?? 0.5;
        // Get break duration (for future use in break timer)
        const breakDuration = config.get('breakReminderTime') ?? 60;
        // Posture reminder settings
        this.postureReminderInterval = config.get('postureReminderInterval') ?? 30 * 60;
        this.postureReminderEnabled = config.get('postureReminderEnabled') ?? true;
        this.postureSnoozeDuration = config.get('postureSnoozeDuration') ?? 15 * 60;
        this.postureNotificationType = config.get('postureNotificationType') ?? 'info';
        this.postureEnableSound = config.get('postureEnableSound') ?? true;
        // Eye strain settings
        this.eyeStrainInterval = config.get('eyeStrainInterval') ?? 20 * 60;
        this.eyeStrainEnabled = config.get('eyeStrainEnabled') ?? true;
        this.eyeStrainSnoozeDuration = config.get('eyeStrainSnoozeDuration') ?? 10 * 60;
        this.eyeStrainNotificationType = config.get('eyeStrainNotificationType') ?? 'info';
        this.eyeStrainEnableSound = config.get('eyeStrainEnableSound') ?? true;
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
    setupEventListeners() {
        // Track user activity to pause reminders when inactive
        this.disposables.push(vscode.window.onDidChangeWindowState(state => {
            this.isActive = state.focused;
            if (this.isActive) {
                this.checkReminders();
            }
        }));
    }
    startTimers() {
        // Clear any existing timers
        this.clearTimers();
        // Set up new timers
        this.timers.push(setInterval(() => this.checkBreakReminder(), 60 * 1000), // Check every minute
        setInterval(() => this.checkPostureReminder(), 60 * 1000), setInterval(() => this.checkEyeStrainReminder(), 60 * 1000));
    }
    clearTimers() {
        this.timers.forEach(timer => clearInterval(timer));
        this.timers = [];
    }
    restartTimers() {
        this.clearTimers();
        this.startTimers();
    }
    checkReminders() {
        this.checkBreakReminder();
        this.checkPostureReminder();
        this.checkEyeStrainReminder();
    }
    async isPomodoroActive() {
        try {
            // Use the command to get Pomodoro state
            const state = await vscode.commands.executeCommand('devtimetracker.getPomodoroState');
            return state?.isRunning && !state.isBreakTime;
        }
        catch (error) {
            console.error('Error checking Pomodoro state:', error);
            return false;
        }
    }
    async checkBreakReminder() {
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
            const notification = NotificationManager_1.NotificationManager.getInstance();
            const selection = await notification.showNotificationCard({
                title: '⏱️ Time for a Break!',
                message: `You've been working for ${minutesWorking} minutes. ` +
                    'Taking regular breaks helps maintain focus and productivity.\n\n' +
                    '**Break Ideas**:\n' +
                    '• Stand up and stretch\n' +
                    '• Look away from the screen\n' +
                    '• Take a short walk\n' +
                    '• Get some water or a snack',
                type: this.breakNotificationType,
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
                    vscode.window.showInformationMessage(`Break reminder snoozed for ${this.breakSnoozeDuration / 60} minutes.`);
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
    async checkPostureReminder() {
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
            const notification = NotificationManager_1.NotificationManager.getInstance();
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
                type: this.postureNotificationType,
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
                    vscode.window.showInformationMessage(`Posture reminder snoozed for ${this.postureSnoozeDuration / 60} minutes.`);
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
    async checkEyeStrainReminder() {
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
            const notification = NotificationManager_1.NotificationManager.getInstance();
            const minutes = Math.floor(timeSinceLastBreak / 60);
            const selection = await notification.showNotificationCard({
                title: '👀 Time for an Eye Break',
                message: `You've been looking at the screen for ${minutes} minutes.\n\n` +
                    '**Follow the 20-20-20 rule**:\n' +
                    '• Every 20 minutes\n' +
                    '• Look at something 20 feet away\n' +
                    '• For 20 seconds\n\n' +
                    'This helps prevent digital eye strain and keeps your eyes healthy.',
                type: this.eyeStrainNotificationType,
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
                    vscode.window.showInformationMessage(`Eye strain reminder snoozed for ${this.eyeStrainSnoozeDuration / 60} minutes.`);
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
    async showBreakTimer(durationInSeconds) {
        const startTime = Date.now();
        const endTime = startTime + durationInSeconds * 1000;
        const notification = NotificationManager_1.NotificationManager.getInstance();
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
            this.breakStatusBarItem.text = `$(clock) Break: ${minutes}:${seconds.toString().padStart(2, '0')}`;
            this.breakStatusBarItem.tooltip = 'Taking a short break...';
            this.breakStatusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
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
    showEyeExerciseTimer() {
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
    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
    dispose() {
        this.clearTimers();
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
    }
}
exports.HealthService = HealthService;
//# sourceMappingURL=HealthService.js.map