import * as vscode from 'vscode';
import { CustomReminderService } from '../services/CustomReminderService';
import { CustomReminder } from '../models/CustomReminder';

export function registerCustomReminderCommands(context: vscode.ExtensionContext) {
  const customReminderService = CustomReminderService.getInstance(context);

  // Command to open the custom reminders management view
  const manageRemindersCommand = vscode.commands.registerCommand('devtimetracker.manageCustomReminders', async () => {
    // Open settings to manage reminders
    vscode.commands.executeCommand('workbench.action.openSettings', 'devtimetracker.customReminders');
    vscode.window.showInformationMessage('💡 Tip: Custom reminders can be managed through VS Code settings');
  });

  // Command to quickly add a new reminder
  const addReminderCommand = vscode.commands.registerCommand('devtimetracker.addCustomReminder', async () => {
    vscode.window.showInformationMessage(
      '💡 Add custom reminders through VS Code settings: Search for "devtimetracker.customReminders"'
    );
    vscode.commands.executeCommand('workbench.action.openSettings', 'devtimetracker.customReminders');
  });

  context.subscriptions.push(manageRemindersCommand, addReminderCommand);
}

function formatSeconds(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  const parts = [];
  if (hours > 0) parts.push(`${hours} hour${hours > 1 ? 's' : ''}`);
  if (minutes > 0 || hours === 0) parts.push(`${minutes} minute${minutes !== 1 ? 's' : ''}`);

  return parts.join(' and ');
}

function getReminderDetails(reminder: CustomReminder): string {
  const parts = [
    `Interval: ${formatSeconds(reminder.interval)}`,
    `Type: ${reminder.notificationType}`,
    `Sound: ${reminder.soundEnabled ? 'On' : 'Off'}`,
    `Status: ${reminder.enabled ? 'Active' : 'Inactive'}`
  ];

  if (reminder.conditions) {
    const conditions = [];
    if (reminder.conditions.minTypingSpeed) conditions.push(`Min speed: ${reminder.conditions.minTypingSpeed} WPM`);
    if (reminder.conditions.maxTypingSpeed) conditions.push(`Max speed: ${reminder.conditions.maxTypingSpeed} WPM`);
    if (reminder.conditions.activeDocumentLanguage?.length) {
      conditions.push(`Languages: ${reminder.conditions.activeDocumentLanguage.join(', ')}`);
    }
    if (conditions.length > 0) {
      parts.push(`Conditions: ${conditions.join(' • ')}`);
    }
  }

  return parts.join(' • ');
}
