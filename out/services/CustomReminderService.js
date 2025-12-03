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
const NotificationManager_1 = require("../utils/NotificationManager");
const STORAGE_KEY = 'devtimetracker.customReminders';
class CustomReminderService {
    static instance = null;
    reminders = new Map();
    notificationManager;
    checkInterval = null;
    static CHECK_INTERVAL = 30 * 1000; // 30 seconds
    context;
    isInitialized = false;
    pendingSave = null;
    static SAVE_DEBOUNCE = 1000; // 1 second debounce for saves
    typingStats = { speed: 0, accuracy: 100 }; // Will be updated by metrics service
    activeDocumentLanguage;
    sessionStartTime = Date.now();
    constructor(context) {
        this.context = context;
        this.notificationManager = NotificationManager_1.NotificationManager.getInstance();
        this.initialize();
    }
    static getInstance(context) {
        if (!CustomReminderService.instance) {
            if (!context) {
                throw new Error('CustomReminderService must be initialized with a context first');
            }
            CustomReminderService.instance = new CustomReminderService(context);
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
            this.activeDocumentLanguage = editor?.document.languageId;
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
        // Simple typing speed calculation (words per minute)
        const content = event.document.getText();
        const wordCount = content.split(/\s+/).length;
        const now = Date.now();
        const timeElapsed = (now - this.sessionStartTime) / 60000; // in minutes
        if (timeElapsed > 0) {
            this.typingStats.speed = Math.round(wordCount / timeElapsed);
        }
    }
    async checkReminders() {
        const now = new Date();
        const sessionDuration = (Date.now() - this.sessionStartTime) / 1000; // in seconds
        for (const [id, reminder] of this.reminders.entries()) {
            if (reminder.shouldTrigger(this.typingStats, this.activeDocumentLanguage, sessionDuration)) {
                await this.triggerReminder(reminder);
            }
        }
    }
    async triggerReminder(reminder) {
        // Update last triggered time
        reminder.lastTriggered = Date.now();
        // Show notification (use 'info' if notificationType is 'none')
        const notificationType = reminder.notificationType === 'none' ? 'info' : reminder.notificationType;
        const result = await this.notificationManager.showNotificationCard({
            title: reminder.title,
            message: reminder.message,
            type: notificationType,
            sound: reminder.soundEnabled ? 'alert' : undefined,
            actions: reminder.actions
        });
        // Handle the selected action
        if (result === 'snooze') {
            // Default snooze for 30 minutes
            reminder.lastTriggered = Date.now() + (30 * 60 * 1000);
            vscode.window.showInformationMessage(`"${reminder.title}" snoozed for 30 minutes`);
        }
        // Save the updated reminder
        await this.saveReminders();
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
        this.typingStats = { ...stats };
    }
    dispose() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
    }
}
exports.CustomReminderService = CustomReminderService;
//# sourceMappingURL=CustomReminderService.js.map