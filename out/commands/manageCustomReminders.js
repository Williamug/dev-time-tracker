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
        await showRemindersQuickPick(customReminderService, context);
    });
    // Command to quickly add a new reminder
    const addReminderCommand = vscode.commands.registerCommand('devtimetracker.addCustomReminder', async () => {
        await addNewReminder(customReminderService);
    });
    context.subscriptions.push(manageRemindersCommand, addReminderCommand);
}
async function showRemindersQuickPick(service, context) {
    const reminders = service.getAllReminders();
    const items = [
        {
            label: '$(plus) Add New Reminder',
            description: 'Create a new custom reminder',
            action: 'add'
        },
        {
            label: '$(refresh) Refresh',
            description: 'Refresh the list of reminders',
            action: 'refresh'
        },
        {
            label: '$(dash) Separator',
            kind: vscode.QuickPickItemKind.Separator
        },
        ...reminders.map(reminder => ({
            label: `${reminder.enabled ? '$(check)' : '$(circle-slash)'} ${reminder.title}`,
            description: `Every ${formatSeconds(reminder.interval)} - ${reminder.message}`,
            detail: getReminderDetails(reminder),
            reminder,
            action: 'edit'
        }))
    ];
    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Manage your custom reminders',
        matchOnDescription: true,
        matchOnDetail: true
    });
    if (!selected)
        return;
    switch (selected.action) {
        case 'add':
            await addNewReminder(service);
            break;
        case 'edit':
            if ('reminder' in selected) {
                await editReminder(service, selected.reminder);
            }
            break;
        case 'refresh':
            await showRemindersQuickPick(service, context);
            break;
    }
}
async function addNewReminder(service) {
    const title = await vscode.window.showInputBox({
        prompt: 'Enter a title for the reminder',
        placeHolder: 'e.g., Drink Water',
        validateInput: value => !value ? 'Title is required' : null
    });
    if (!title)
        return;
    const message = await vscode.window.showInputBox({
        prompt: 'Enter the reminder message',
        placeHolder: 'e.g., Time to hydrate!',
        value: `Time to ${title.toLowerCase()}!`
    }) || '';
    const intervalMinutes = await vscode.window.showInputBox({
        prompt: 'How often should this reminder appear? (in minutes)',
        value: '30',
        validateInput: value => {
            const num = Number(value);
            if (isNaN(num) || num <= 0)
                return 'Please enter a valid number greater than 0';
            return null;
        }
    });
    if (!intervalMinutes)
        return;
    const notificationType = await vscode.window.showQuickPick(['info', 'warning', 'error', 'none'].map(type => ({
        label: type.charAt(0).toUpperCase() + type.slice(1),
        type
    })), { placeHolder: 'Select notification type' });
    if (!notificationType)
        return;
    const reminder = {
        title,
        message,
        interval: Number(intervalMinutes) * 60, // Convert to seconds
        notificationType: notificationType.type,
        enabled: true,
        soundEnabled: true
    };
    await service.addReminder(reminder);
    vscode.window.showInformationMessage(`Reminder "${title}" has been added`);
}
async function editReminder(service, reminder) {
    const actions = [
        { label: 'Toggle Enable/Disable', action: 'toggle' },
        { label: 'Edit', action: 'edit' },
        { label: 'Delete', action: 'delete' },
        { label: 'Cancel', action: 'cancel' }
    ];
    const selected = await vscode.window.showQuickPick(actions, {
        placeHolder: `Manage reminder: ${reminder.title}`
    });
    if (!selected)
        return;
    switch (selected.action) {
        case 'toggle':
            await service.updateReminder(reminder.id, { enabled: !reminder.enabled });
            vscode.window.showInformationMessage(`Reminder "${reminder.title}" has been ${reminder.enabled ? 'disabled' : 'enabled'}`);
            break;
        case 'edit':
            // For simplicity, we'll just delete and recreate the reminder
            await service.deleteReminder(reminder.id);
            await addNewReminder(service);
            break;
        case 'delete':
            const confirm = await vscode.window.showQuickPick(['Yes', 'No'], { placeHolder: `Are you sure you want to delete "${reminder.title}"?` });
            if (confirm === 'Yes') {
                await service.deleteReminder(reminder.id);
                vscode.window.showInformationMessage(`Reminder "${reminder.title}" has been deleted`);
            }
            break;
    }
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