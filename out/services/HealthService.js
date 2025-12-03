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
const HealthStatusBar_1 = require("../status/HealthStatusBar");
class HealthService {
    static instance;
    metricsCollector = Metrics_1.MetricsCollector.getInstance();
    disposables = [];
    timers = [];
    backendService = null;
    // Break reminder settings
    breakReminderInterval = 60; // 60 minutes default
    breakReminderEnabled = true;
    breakSnoozeDuration = 15; // 15 minutes default
    breakNotificationType = 'none';
    breakEnableSound = false;
    breakSnoozedUntil = 0;
    context;
    // Posture reminder settings
    postureReminderInterval = 30; // 30 minutes default
    postureReminderEnabled = true;
    postureSnoozeDuration = 15; // 15 minutes default
    postureNotificationType = 'none';
    postureEnableSound = false;
    postureSnoozedUntil = 0;
    // Eye strain settings
    eyeStrainInterval = 20; // 20 minutes default (20-20-20 rule)
    eyeStrainEnabled = true;
    eyeStrainSnoozeDuration = 10; // 10 minutes default
    eyeStrainNotificationType = 'none';
    eyeStrainEnableSound = false;
    eyeStrainSnoozedUntil = 0;
    // State
    lastBreakTime;
    lastPostureCheck;
    lastEyeStrainBreak;
    isActive;
    healthStatusBar;
    breakTimer = null;
    eyeExerciseTimer = null;
    constructor(backendService, context) {
        this.context = context;
        // Initialize timestamps
        const now = Date.now();
        this.lastBreakTime = now;
        this.lastPostureCheck = now;
        this.lastEyeStrainBreak = now;
        this.isActive = true;
        this.backendService = backendService || null;
        // Initialize status bar
        this.healthStatusBar = HealthStatusBar_1.HealthStatusBar.getInstance();
        console.log('[HealthService] HealthStatusBar initialized');
        // Load configuration and initialize
        this.loadConfig();
        this.initialize();
    }
    static getInstance(backendService, context) {
        if (!HealthService.instance) {
            HealthService.instance = new HealthService(backendService, context);
        }
        else {
            if (backendService)
                HealthService.instance.backendService = backendService;
            if (context)
                HealthService.instance.context = context;
        }
        return HealthService.instance;
    }
    initialize() {
        console.log('[HealthService] Initializing...');
        this.setupEventListeners();
        this.startTimers();
        console.log('[HealthService] Initialization complete');
    }
    loadConfig() {
        try {
            const config = vscode.workspace.getConfiguration('devtimetracker.health');
            console.log('[HealthService] Loading configuration');
            // Break reminder settings (convert seconds to minutes)
            this.breakReminderInterval = Math.floor((config.get('breakReminderInterval') ?? 3600) / 60);
            this.breakReminderEnabled = config.get('breakReminderEnabled') ?? true;
            this.breakSnoozeDuration = Math.floor((config.get('breakSnoozeDuration') ?? 900) / 60);
            this.breakNotificationType = config.get('breakNotificationType') ?? 'info';
            this.breakEnableSound = config.get('breakEnableSound') ?? false;
            // Posture reminder settings (convert seconds to minutes)
            this.postureReminderInterval = Math.floor((config.get('postureReminderInterval') ?? 1800) / 60);
            this.postureReminderEnabled = config.get('postureReminderEnabled') ?? true;
            this.postureSnoozeDuration = Math.floor((config.get('postureSnoozeDuration') ?? 900) / 60);
            this.postureNotificationType = config.get('postureNotificationType') ?? 'info';
            this.postureEnableSound = config.get('postureEnableSound') ?? false;
            // Eye strain reminder settings (convert seconds to minutes)
            this.eyeStrainInterval = Math.floor((config.get('eyeStrainReminderInterval') ?? 1200) / 60);
            this.eyeStrainEnabled = config.get('eyeStrainReminderEnabled') ?? true;
            this.eyeStrainSnoozeDuration = Math.floor((config.get('eyeStrainSnoozeDuration') ?? 600) / 60);
            this.eyeStrainNotificationType = config.get('eyeStrainNotificationType') ?? 'info';
            this.eyeStrainEnableSound = config.get('eyeStrainEnableSound') ?? false;
        }
        catch (error) {
            console.error('[HealthService] Error loading configuration:', error);
            this.setDefaultConfig();
        }
    }
    setDefaultConfig() {
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
    }
    setupEventListeners() {
        // Window focus change
        this.disposables.push(vscode.window.onDidChangeWindowState(state => {
            this.isActive = state.focused;
            if (this.isActive) {
                this.restartTimers();
            }
            else {
                this.clearTimers();
            }
        }));
        // Configuration changes
        this.disposables.push(vscode.workspace.onDidChangeConfiguration(e => {
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
        }));
    }
    startTimers() {
        this.clearTimers();
        // Start break reminder timer if enabled
        if (this.breakReminderEnabled) {
            console.log('[HealthService] Starting break reminder timer');
            const breakTimer = setInterval(() => this.checkBreakReminder(), 60000); // Check every minute
            this.timers.push(breakTimer);
        }
        else {
            this.healthStatusBar.clearBreakReminder();
        }
        // Start posture reminder timer if enabled
        if (this.postureReminderEnabled) {
            console.log('[HealthService] Starting posture reminder timer');
            const postureTimer = setInterval(() => this.checkPostureReminder(), 60000); // Check every minute
            this.timers.push(postureTimer);
        }
        else {
            this.healthStatusBar.clearPostureReminder();
        }
        // Start eye strain timer if enabled
        if (this.eyeStrainEnabled) {
            console.log('[HealthService] Starting eye strain reminder timer');
            const eyeStrainTimer = setInterval(() => this.checkEyeStrainReminder(), 60000); // Check every minute
            this.timers.push(eyeStrainTimer);
        }
        else {
            this.healthStatusBar.clearEyeStrainReminder();
        }
    }
    restartTimers() {
        this.startTimers();
    }
    clearTimers() {
        this.timers.forEach(timer => clearInterval(timer));
        this.timers = [];
    }
    async checkBreakReminder() {
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
            this.lastBreakTime = now; // Reset timer after showing notification
        }
        else {
            const minutesRemaining = Math.ceil((intervalMs - timeSinceLastBreak) / 60000);
            this.healthStatusBar.updateBreakReminder(minutesRemaining);
        }
    }
    async checkPostureReminder() {
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
            this.lastPostureCheck = now; // Reset timer after showing notification
        }
        else {
            const minutesRemaining = Math.ceil((intervalMs - timeSinceLastCheck) / 60000);
            this.healthStatusBar.updatePostureReminder(minutesRemaining);
        }
    }
    async checkEyeStrainReminder() {
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
        }
        else {
            const minutesRemaining = Math.ceil((intervalMs - timeSinceLastBreak) / 60000);
            this.healthStatusBar.updateEyeStrainReminder(minutesRemaining);
        }
    }
    async showBreakReminder() {
        this.healthStatusBar.showBreakReminder(0); // Show active reminder in status bar
        if (this.breakNotificationType !== 'none') {
            const intervalMinutes = this.breakReminderInterval;
            const message = `⏰ Time for a break! You've been coding for ${intervalMinutes} minutes. Stand up, stretch, and rest your eyes.`;
            await this.showNotification(message, 'break');
        }
    }
    async showPostureReminder() {
        this.healthStatusBar.showPostureReminder(0); // Show active reminder in status bar
        if (this.postureNotificationType !== 'none') {
            const message = '🧍 Posture check! Sit up straight, adjust your chair height, and keep your feet flat on the floor.';
            await this.showNotification(message, 'posture');
        }
    }
    async showEyeStrainReminder() {
        this.healthStatusBar.showEyeStrainReminder(0); // Show active reminder in status bar
        if (this.eyeStrainNotificationType !== 'none') {
            const message = '👁️ Eye break time! Follow the 20-20-20 rule: Look at something 20 feet away for 20 seconds.';
            await this.showNotification(message, 'eyeStrain');
        }
    }
    async showNotification(message, type) {
        // Show a simple, non-blocking notification without action buttons
        vscode.window.showInformationMessage(message);
        // Log for debugging
        console.log(`[HealthService] Showed ${type} reminder: ${message}`);
    }
    getReminderTypeLabel(type) {
        switch (type) {
            case 'break': return 'Break reminder';
            case 'posture': return 'Posture reminder';
            case 'eyeStrain': return 'Eye strain reminder';
        }
    }
    async disableReminder(type) {
        const config = vscode.workspace.getConfiguration('devtimetracker.health');
        const key = type === 'break' ? 'breakReminderEnabled' :
            type === 'posture' ? 'postureReminderEnabled' :
                'eyeStrainReminderEnabled';
        await config.update(key, false, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage(`${this.getReminderTypeLabel(type)} disabled. You can re-enable it in settings.`, 'Open Settings').then(selection => {
            if (selection === 'Open Settings') {
                vscode.commands.executeCommand('workbench.action.openSettings', 'devtimetracker.health');
            }
        });
    }
    async start202020Timer() {
        // Show an information message with a 20-second countdown
        let countdown = 20;
        const countdownMessage = vscode.window.setStatusBarMessage(`$(eye) 20-20-20 Rule: Look at something 20 feet away for ${countdown} seconds...`);
        // Create a countdown timer
        const timer = setInterval(() => {
            countdown--;
            if (countdown > 0) {
                countdownMessage.dispose();
                vscode.window.setStatusBarMessage(`$(eye) 20-20-20 Rule: Look at something 20 feet away for ${countdown} seconds...`);
            }
            else {
                clearInterval(timer);
                countdownMessage.dispose();
                vscode.window.showInformationMessage('$(check) Great! Your 20-20-20 break is complete. Your eyes should feel refreshed!');
                // Reset the eye strain timer
                this.lastEyeStrainBreak = Date.now();
            }
        }, 1000);
        // Show initial notification
        vscode.window.showInformationMessage('$(eye) Starting 20-20-20 timer: Look at something 20 feet away for 20 seconds.', 'Cancel').then(selection => {
            if (selection === 'Cancel') {
                clearInterval(timer);
                countdownMessage.dispose();
                vscode.window.showInformationMessage('20-20-20 timer cancelled');
            }
        });
    }
    dispose() {
        this.clearTimers();
        this.disposables.forEach(disposable => disposable.dispose());
        this.disposables = [];
    }
    // Helper to format time (mm:ss)
    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
}
exports.HealthService = HealthService;
//# sourceMappingURL=HealthService.js.map