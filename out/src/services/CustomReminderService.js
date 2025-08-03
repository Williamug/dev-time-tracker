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
exports.CustomReminderService = void 0;
const vscode = __importStar(require("vscode"));
const CustomReminder_1 = require("../models/CustomReminder");
const IMetricsProvider_1 = require("../models/IMetricsProvider");
const STORAGE_KEY = 'devtimetracker.customReminders';
class CustomReminderService {
    metricsProvider;
    static instance = null;
    reminders = new Map();
    checkInterval = null;
    static CHECK_INTERVAL = 30 * 1000; // 30 seconds
    context;
    isInitialized = false;
    pendingSave = null;
    static SAVE_DEBOUNCE = 1000; // 1 second debounce for saves
    /**
     * Gets the current typing statistics from the metrics provider
     */
    getTypingStats() {
        return this.metricsProvider.getTypingStats();
    }
    /**
     * Gets the duration of the current coding session in seconds
     */
    getCurrentSessionDuration() {
        return this.metricsProvider.getCurrentSessionDuration();
    }
    /**
     * Gets the language of the currently active document
     */
    getActiveDocumentLanguage() {
        return this.metricsProvider.getActiveDocumentLanguage();
    }
    constructor(context, metricsProvider = new IMetricsProvider_1.DefaultMetricsProvider()) {
        this.metricsProvider = metricsProvider;
        this.context = context;
        this.loadReminders();
    }
    static getInstance(context, metricsProvider) {
        if (!CustomReminderService.instance) {
            if (!context) {
                throw new Error('CustomReminderService must be initialized with a context first');
            }
            CustomReminderService.instance = new CustomReminderService(context, metricsProvider);
        }
        return CustomReminderService.instance;
    }
    async initialize() {
        if (this.isInitialized)
            return;
        try {
            await this.loadReminders();
            this.setupEventListeners();
            this.startChecking();
            this.isInitialized = true;
            console.log('[CustomReminderService] Initialized successfully');
        }
        catch (error) {
            console.error('[CustomReminderService] Initialization failed:', error);
            throw error;
        }
    }
    async loadReminders() {
        try {
            const savedReminders = this.context.globalState.get(STORAGE_KEY, []);
            this.reminders = new Map(savedReminders.map(reminder => [reminder.id, CustomReminder_1.CustomReminder.fromJSON(reminder)]));
            console.log(`[CustomReminderService] Loaded ${savedReminders.length} reminders`);
        }
        catch (error) {
            console.error('[CustomReminderService] Failed to load reminders:', error);
            this.reminders = new Map(); // Reset to empty map on error
        }
    }
    async saveReminders() {
        // Debounce save operations to prevent rapid successive saves
        if (this.pendingSave) {
            clearTimeout(this.pendingSave);
        }
        return new Promise((resolve, reject) => {
            this.pendingSave = setTimeout(async () => {
                try {
                    const reminders = Array.from(this.reminders.values()).map(r => r.toJSON());
                    await this.context.globalState.update(STORAGE_KEY, reminders);
                    console.log(`[CustomReminderService] Saved ${reminders.length} reminders`);
                    resolve();
                }
                catch (error) {
                    console.error('[CustomReminderService] Failed to save reminders:', error);
                    reject(error);
                }
                finally {
                    this.pendingSave = null;
                }
            }, CustomReminderService.SAVE_DEBOUNCE);
        });
    }
    setupEventListeners() {
        // Listen for document changes to track typing activity
        this.context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(event => {
            if (event.contentChanges.length > 0) {
                this.checkTypingSpeed(event);
            }
        }));
        // Save reminders when the extension is deactivated
        this.context.subscriptions.push({
            dispose: async () => {
                try {
                    await this.saveReminders();
                }
                catch (error) {
                    console.error('[CustomReminderService] Error during cleanup:', error);
                }
            }
        });
        // Update active document language when editor changes
        this.context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(editor => {
            // Active document language is now handled by the metrics provider
        }));
    }
    startChecking() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
        }
        this.checkInterval = setInterval(async () => {
            try {
                await this.checkReminders();
            }
            catch (error) {
                console.error('[CustomReminderService] Error checking reminders:', error);
            }
        }, CustomReminderService.CHECK_INTERVAL);
    }
    async checkTypingSpeed(event) {
        // Typing speed is now handled by the MetricsService
        // This method is kept for backward compatibility
    }
    async checkReminders() {
        const typingStats = this.metricsProvider.getTypingStats();
        const sessionDuration = this.metricsProvider.getCurrentSessionDuration();
        const language = this.metricsProvider.getActiveDocumentLanguage();
        for (const [id, reminder] of this.reminders.entries()) {
            if (reminder.shouldTrigger(typingStats, language, sessionDuration)) {
                await this.showReminder(reminder, 'Reminder triggered');
            }
        }
    }
    async showReminder(reminder, reason) {
        // Don't show any popup notifications - just log to console
        console.log(`[CustomReminder] ${reminder.title}: ${reminder.message} (${reason})`);
        // Show in status bar instead of popup
        const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        statusBar.text = `$(bell) ${reminder.title}`;
        statusBar.tooltip = `${reminder.message}\n\n${reason}`;
        statusBar.show();
        // Auto-hide after 10 seconds
        setTimeout(() => {
            statusBar.dispose();
        }, 10000);
    }
    getNotificationType(type) {
        if (type === 'none' || type === 'info')
            return 'info';
        if (type === 'warning')
            return 'warning';
        if (type === 'error')
            return 'error';
        return 'info';
    }
    handleAction(reminder, action) {
        // Handle snooze action
        if (action.action.toLowerCase() === 'snooze') {
            // Default snooze for 30 minutes
            reminder.lastTriggered = Date.now() + (30 * 60 * 1000);
            console.log(`[CustomReminder] "${reminder.title}" snoozed for 30 minutes`);
        }
        // Add more action types as needed
        // Save the updated reminder
        this.saveReminders();
    }
    // Public API
    async addReminder(reminder) {
        const newReminder = new CustomReminder_1.CustomReminder(reminder);
        this.reminders.set(newReminder.id, newReminder);
        await this.saveReminders();
        return newReminder;
    }
    getReminder(id) {
        return this.reminders.get(id);
    }
    getAllReminders() {
        return Array.from(this.reminders.values());
    }
    async updateReminder(id, updates) {
        const reminder = this.reminders.get(id);
        if (!reminder)
            return false;
        Object.assign(reminder, updates);
        await this.saveReminders();
        return true;
    }
    async deleteReminder(id) {
        const deleted = this.reminders.delete(id);
        if (deleted) {
            await this.saveReminders();
        }
        return deleted;
    }
    updateTypingStats(stats) {
        // Stats are now managed by the MetricsService
        // This method is kept for backward compatibility
    }
    dispose() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
    }
    /**
     * Resets the singleton instance for testing purposes
     * @internal
     */
    static resetInstance() {
        if (CustomReminderService.instance) {
            CustomReminderService.instance.dispose();
            CustomReminderService.instance = null;
        }
    }
}
exports.CustomReminderService = CustomReminderService;
//# sourceMappingURL=CustomReminderService.js.map