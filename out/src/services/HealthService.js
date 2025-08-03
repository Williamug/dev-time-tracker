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
    breakReminderInterval = 1;
    breakReminderEnabled = true;
    breakSnoozeDuration = 5;
    breakNotificationType = 'none';
    breakEnableSound = false;
    breakSnoozedUntil = 0;
    context;
    // Posture reminder settings
    postureReminderInterval = 1;
    postureReminderEnabled = true;
    postureSnoozeDuration = 5;
    postureNotificationType = 'none';
    postureEnableSound = false;
    postureSnoozedUntil = 0;
    // Eye strain settings
    eyeStrainInterval = 1;
    eyeStrainEnabled = true;
    eyeStrainSnoozeDuration = 5;
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
        // Force show all status bar items for testing
        this.healthStatusBar.showBreakReminder(1);
        this.healthStatusBar.showPostureReminder(1);
        this.healthStatusBar.showEyeStrainReminder(1);
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
            // Break reminder settings
            this.breakReminderInterval = config.get('breakReminderInterval') ?? 1;
            this.breakReminderEnabled = config.get('breakReminderEnabled') ?? true;
            this.breakSnoozeDuration = config.get('breakSnoozeDuration') ?? 5;
            this.breakNotificationType = config.get('breakNotificationType') ?? 'none';
            this.breakEnableSound = config.get('breakEnableSound') ?? false;
            // Posture reminder settings
            this.postureReminderInterval = config.get('postureReminderInterval') ?? 1;
            this.postureReminderEnabled = config.get('postureReminderEnabled') ?? true;
            this.postureSnoozeDuration = config.get('postureSnoozeDuration') ?? 5;
            this.postureNotificationType = config.get('postureNotificationType') ?? 'none';
            this.postureEnableSound = config.get('postureEnableSound') ?? false;
            // Eye strain reminder settings
            this.eyeStrainInterval = config.get('eyeStrainInterval') ?? 1;
            this.eyeStrainEnabled = config.get('eyeStrainEnabled') ?? true;
            this.eyeStrainSnoozeDuration = config.get('eyeStrainSnoozeDuration') ?? 5;
            this.eyeStrainNotificationType = config.get('eyeStrainNotificationType') ?? 'none';
            this.eyeStrainEnableSound = config.get('eyeStrainEnableSound') ?? false;
        }
        catch (error) {
            console.error('[HealthService] Error loading configuration:', error);
            this.setDefaultConfig();
        }
    }
    setDefaultConfig() {
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
                this.loadConfig();
                this.restartTimers();
            }
        }));
    }
    startTimers() {
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
    restartTimers() {
        this.startTimers();
    }
    clearTimers() {
        this.timers.forEach(timer => clearInterval(timer));
        this.timers = [];
    }
    async checkBreakReminder() {
        const now = Date.now();
        if (now > this.lastBreakTime + this.breakReminderInterval * 60000) {
            await this.showBreakReminder();
        }
    }
    async checkPostureReminder() {
        const now = Date.now();
        if (now > this.lastPostureCheck + this.postureReminderInterval * 60000) {
            await this.showPostureReminder();
        }
    }
    async checkEyeStrainReminder() {
        const now = Date.now();
        if (now > this.lastEyeStrainBreak + this.eyeStrainInterval * 60000) {
            await this.showEyeStrainReminder();
        }
    }
    async showBreakReminder() {
        if (this.breakNotificationType !== 'none') {
            const message = 'Time to take a break!';
            await this.showNotification(message, 'break');
        }
        this.lastBreakTime = Date.now();
    }
    async showPostureReminder() {
        if (this.postureNotificationType !== 'none') {
            const message = 'Check your posture!';
            await this.showNotification(message, 'posture');
        }
        this.lastPostureCheck = Date.now();
    }
    async showEyeStrainReminder() {
        if (this.eyeStrainNotificationType !== 'none') {
            const message = 'Time to rest your eyes!';
            await this.showNotification(message, 'eyeStrain');
        }
        this.lastEyeStrainBreak = Date.now();
    }
    async showNotification(message, type) {
        const snoozeMinutes = type === 'break' ? this.breakSnoozeDuration :
            type === 'posture' ? this.postureSnoozeDuration :
                this.eyeStrainSnoozeDuration;
        const snoozeLabel = `Snooze (${snoozeMinutes}m)`;
        const selection = await vscode.window.showInformationMessage(message, snoozeLabel, 'Dismiss');
        if (selection === snoozeLabel) {
            const snoozeTime = Date.now() + (snoozeMinutes * 60000);
            if (type === 'break')
                this.breakSnoozedUntil = snoozeTime;
            else if (type === 'posture')
                this.postureSnoozedUntil = snoozeTime;
            else
                this.eyeStrainSnoozedUntil = snoozeTime;
        }
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