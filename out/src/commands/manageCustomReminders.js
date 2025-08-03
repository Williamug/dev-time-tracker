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
exports.registerCustomReminderCommands = registerCustomReminderCommands;
const vscode = __importStar(require("vscode"));
const CustomReminderService_1 = require("../services/CustomReminderService");
function registerCustomReminderCommands(context) {
    const customReminderService = CustomReminderService_1.CustomReminderService.getInstance(context);
    // Command to open the custom reminders management view
    const manageRemindersCommand = vscode.commands.registerCommand('devtimetracker.manageCustomReminders', async () => {
        showFeatureNotAvailable();
    });
    // Command to quickly add a new reminder
    const addReminderCommand = vscode.commands.registerCommand('devtimetracker.addCustomReminder', async () => {
        showFeatureNotAvailable();
    });
    context.subscriptions.push(manageRemindersCommand, addReminderCommand);
}
function showFeatureNotAvailable() {
    // Show feedback in status bar instead of popup
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
    statusBarItem.text = '$(error) Custom reminders not available';
    statusBarItem.tooltip = 'This feature requires popup dialogs which are disabled in this version.';
    statusBarItem.show();
    // Auto-hide after 5 seconds
    setTimeout(() => {
        statusBarItem.dispose();
    }, 5000);
}
function formatSeconds(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const parts = [];
    if (hours > 0)
        parts.push(`${hours} hour${hours > 1 ? 's' : ''}`);
    if (minutes > 0 || hours === 0)
        parts.push(`${minutes} minute${minutes !== 1 ? 's' : ''}`);
    return parts.join(' and ');
}
function getReminderDetails(reminder) {
    const parts = [
        `Interval: ${formatSeconds(reminder.interval)}`,
        `Type: ${reminder.notificationType}`,
        `Sound: ${reminder.soundEnabled ? 'On' : 'Off'}`,
        `Status: ${reminder.enabled ? 'Active' : 'Inactive'}`
    ];
    if (reminder.conditions) {
        const conditions = [];
        if (reminder.conditions.minTypingSpeed)
            conditions.push(`Min speed: ${reminder.conditions.minTypingSpeed} WPM`);
        if (reminder.conditions.maxTypingSpeed)
            conditions.push(`Max speed: ${reminder.conditions.maxTypingSpeed} WPM`);
        if (reminder.conditions.activeDocumentLanguage?.length) {
            conditions.push(`Languages: ${reminder.conditions.activeDocumentLanguage.join(', ')}`);
        }
        if (conditions.length > 0) {
            parts.push(`Conditions: ${conditions.join(' • ')}`);
        }
    }
    return parts.join(' • ');
}
//# sourceMappingURL=manageCustomReminders.js.map