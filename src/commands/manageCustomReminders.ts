import * as vscode from 'vscode';
import { CustomReminderService } from '../services/CustomReminderService';
import { ICustomReminder, ScheduledTime } from '../models/CustomReminder';

export function registerCustomReminderCommands(context: vscode.ExtensionContext) {
  try {
    // Command to open the custom reminders management view
    const manageRemindersCommand = vscode.commands.registerCommand('devtimetracker.manageCustomReminders', async () => {
      await showReminderManagementUI(context);
    });

    // Command to quickly add a new reminder
    const addReminderCommand = vscode.commands.registerCommand('devtimetracker.addCustomReminder', async () => {
      await addNewReminder(context);
    });

    context.subscriptions.push(manageRemindersCommand, addReminderCommand);
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to register custom reminder commands: ${error}`);
  }
}

async function showReminderManagementUI(context: vscode.ExtensionContext) {
  const config = vscode.workspace.getConfiguration('devtimetracker');
  const reminders = config.get<ICustomReminder[]>('customReminders', []);

  const items: vscode.QuickPickItem[] = [
    {
      label: '$(add) Add New Reminder',
      description: 'Create a new custom reminder',
      alwaysShow: true
    },
    {
      label: '',
      kind: vscode.QuickPickItemKind.Separator
    }
  ];

  // Add existing reminders
  reminders.forEach((reminder, index) => {
    const statusIcon = reminder.enabled ? '$(check)' : '$(circle-slash)';
    const scheduleText = reminder.scheduleType === 'scheduled' && reminder.scheduledTimes
      ? formatScheduledTimes(reminder.scheduledTimes)
      : formatSeconds(reminder.interval);
    items.push({
      label: `${statusIcon} ${reminder.title}`,
      description: scheduleText,
      detail: reminder.message,
      alwaysShow: true,
      // Store index in buttons for later reference
      buttons: [
        {
          iconPath: new vscode.ThemeIcon(reminder.enabled ? 'debug-pause' : 'debug-start'),
          tooltip: reminder.enabled ? 'Disable' : 'Enable'
        },
        {
          iconPath: new vscode.ThemeIcon('edit'),
          tooltip: 'Edit'
        },
        {
          iconPath: new vscode.ThemeIcon('trash'),
          tooltip: 'Delete'
        }
      ]
    } as any);
  });

  if (reminders.length === 0) {
    items.push({
      label: '$(info) No custom reminders configured',
      description: 'Click "Add New Reminder" to get started',
      alwaysShow: true
    });
  }

  const quickPick = vscode.window.createQuickPick();
  quickPick.title = 'Custom Reminders';
  quickPick.placeholder = 'Select an option';
  quickPick.items = items;
  quickPick.canSelectMany = false;

  quickPick.onDidAccept(async () => {
    const selected = quickPick.selectedItems[0];
    if (!selected) return;

    if (selected.label === '$(add) Add New Reminder') {
      quickPick.hide();
      await addNewReminder(context);
    } else if (selected.label.startsWith('$(check)') || selected.label.startsWith('$(circle-slash)')) {
      // Find the reminder index
      const reminderIndex = items.indexOf(selected) - 2; // Subtract header items
      if (reminderIndex >= 0) {
        quickPick.hide();
        await editReminder(context, reminderIndex);
      }
    }
  });

  quickPick.onDidTriggerItemButton(async (e) => {
    const item = e.item;
    const button = e.button;
    const reminderIndex = items.indexOf(item) - 2;

    if (reminderIndex >= 0) {
      const config = vscode.workspace.getConfiguration('devtimetracker');
      const currentReminders = config.get<ICustomReminder[]>('customReminders', []);

      if (button.tooltip === 'Enable' || button.tooltip === 'Disable') {
        // Toggle enabled state
        currentReminders[reminderIndex].enabled = !currentReminders[reminderIndex].enabled;
        await config.update('customReminders', currentReminders, vscode.ConfigurationTarget.Global);
        quickPick.hide();
        vscode.window.showInformationMessage(
          `Reminder "${currentReminders[reminderIndex].title}" ${currentReminders[reminderIndex].enabled ? 'enabled' : 'disabled'}`
        );
      } else if (button.tooltip === 'Edit') {
        quickPick.hide();
        await editReminder(context, reminderIndex);
      } else if (button.tooltip === 'Delete') {
        const confirm = await vscode.window.showWarningMessage(
          `Delete reminder "${currentReminders[reminderIndex].title}"?`,
          { modal: true },
          'Delete'
        );
        if (confirm === 'Delete') {
          currentReminders.splice(reminderIndex, 1);
          await config.update('customReminders', currentReminders, vscode.ConfigurationTarget.Global);
          quickPick.hide();
          vscode.window.showInformationMessage('Reminder deleted');
        }
      }
    }
  });

  quickPick.show();
}

async function addNewReminder(context: vscode.ExtensionContext) {
  // Step 1: Get title
  const title = await vscode.window.showInputBox({
    prompt: 'Enter reminder title',
    placeHolder: 'e.g., Commit Code, Take a Break',
    validateInput: (value) => {
      if (!value || value.trim().length === 0) {
        return 'Title is required';
      }
      return null;
    }
  });

  if (!title) return;

  // Step 2: Get message
  const message = await vscode.window.showInputBox({
    prompt: 'Enter reminder message',
    placeHolder: 'e.g., Don\'t forget to commit your changes',
    validateInput: (value) => {
      if (!value || value.trim().length === 0) {
        return 'Message is required';
      }
      return null;
    }
  });

  if (!message) return;

  // Step 3: Choose schedule type
  const scheduleTypeChoice = await vscode.window.showQuickPick([
    { label: '$(clock) Time-based Schedule', description: 'Show at specific times (e.g., every day at 11:00)', value: 'scheduled' },
    { label: '$(history) Interval-based', description: 'Show every X minutes/hours', value: 'interval' }
  ], {
    placeHolder: 'How should this reminder be triggered?'
  });

  if (!scheduleTypeChoice) return;

  let interval = 1800; // default 30 minutes
  let scheduledTimes: ScheduledTime[] = [];

  if (scheduleTypeChoice.value === 'scheduled') {
    // Get scheduled times
    const times = await addScheduledTime();
    if (!times || times.length === 0) return;
    scheduledTimes = times;
  } else {
    // Step 3: Get interval
    const intervalOptions = [
      { label: '5 minutes', value: 300 },
      { label: '10 minutes', value: 600 },
      { label: '15 minutes', value: 900 },
      { label: '30 minutes', value: 1800 },
      { label: '1 hour', value: 3600 },
      { label: '2 hours', value: 7200 },
      { label: 'Custom...', value: -1 }
    ];

    const intervalChoice = await vscode.window.showQuickPick(intervalOptions, {
      placeHolder: 'Select reminder interval'
    });

    if (!intervalChoice) return;

    interval = intervalChoice.value;

    if (interval === -1) {
      const customMinutes = await vscode.window.showInputBox({
        prompt: 'Enter custom interval in minutes',
        placeHolder: 'e.g., 45',
        validateInput: (value) => {
          const num = parseInt(value);
          if (isNaN(num) || num <= 0) {
            return 'Please enter a valid positive number';
          }
          return null;
        }
      });

      if (!customMinutes) return;
      interval = parseInt(customMinutes) * 60;
    }
  }

  // Create the reminder
  const newReminder: ICustomReminder = {
    id: `reminder-${Date.now()}`,
    title: title.trim(),
    message: message.trim(),
    interval,
    scheduleType: scheduleTypeChoice.value as 'interval' | 'scheduled',
    scheduledTimes: scheduledTimes.length > 0 ? scheduledTimes : undefined,
    enabled: true,
    notificationType: 'info',
    soundEnabled: false,
    actions: [
      { title: 'Dismiss', action: 'dismiss', isPrimary: true }
    ]
  };

  // Save to config
  const config = vscode.workspace.getConfiguration('devtimetracker');
  const currentReminders = config.get<ICustomReminder[]>('customReminders', []);
  currentReminders.push(newReminder);
  await config.update('customReminders', currentReminders, vscode.ConfigurationTarget.Global);

  vscode.window.showInformationMessage(`✓ Reminder "${title}" created and enabled`);
}

async function editReminder(context: vscode.ExtensionContext, index: number) {
  const config = vscode.workspace.getConfiguration('devtimetracker');
  const reminders = config.get<ICustomReminder[]>('customReminders', []);
  const reminder = reminders[index];

  if (!reminder) return;

  const options = [
    { label: '$(edit) Edit Title', action: 'title' },
    { label: '$(comment) Edit Message', action: 'message' },
    { label: reminder.scheduleType === 'scheduled' ? '$(calendar) Edit Schedule' : '$(clock) Change Interval', action: 'schedule' },
    { label: '$(refresh) Change Schedule Type', action: 'scheduleType' },
    { label: reminder.enabled ? '$(debug-pause) Disable' : '$(debug-start) Enable', action: 'toggle' },
    { label: '$(trash) Delete', action: 'delete' }
  ];

  const choice = await vscode.window.showQuickPick(options, {
    placeHolder: `Edit: ${reminder.title}`
  });

  if (!choice) return;

  switch (choice.action) {
    case 'title':
      const newTitle = await vscode.window.showInputBox({
        prompt: 'Enter new title',
        value: reminder.title,
        validateInput: (value) => value.trim().length === 0 ? 'Title is required' : null
      });
      if (newTitle) {
        reminder.title = newTitle.trim();
        await config.update('customReminders', reminders, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage('Title updated');
      }
      break;

    case 'message':
      const newMessage = await vscode.window.showInputBox({
        prompt: 'Enter new message',
        value: reminder.message,
        validateInput: (value) => value.trim().length === 0 ? 'Message is required' : null
      });
      if (newMessage) {
        reminder.message = newMessage.trim();
        await config.update('customReminders', reminders, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage('Message updated');
      }
      break;

    case 'schedule':
      if (reminder.scheduleType === 'scheduled') {
        // Edit scheduled times
        const times = await addScheduledTime(reminder.scheduledTimes);
        if (times && times.length > 0) {
          reminder.scheduledTimes = times;
          await config.update('customReminders', reminders, vscode.ConfigurationTarget.Global);
          vscode.window.showInformationMessage('Schedule updated');
        }
      } else {
        // Edit interval
        const intervalOptions = [
          { label: '5 minutes', value: 300 },
          { label: '10 minutes', value: 600 },
          { label: '15 minutes', value: 900 },
          { label: '30 minutes', value: 1800 },
          { label: '1 hour', value: 3600 },
          { label: '2 hours', value: 7200 },
          { label: 'Custom...', value: -1 }
        ];

        const intervalChoice = await vscode.window.showQuickPick(intervalOptions, {
          placeHolder: `Current: ${formatSeconds(reminder.interval)}`
        });

        if (intervalChoice) {
          let interval = intervalChoice.value;
          if (interval === -1) {
            const customMinutes = await vscode.window.showInputBox({
              prompt: 'Enter interval in minutes',
              value: String(Math.floor(reminder.interval / 60)),
              validateInput: (value) => {
                const num = parseInt(value);
                return isNaN(num) || num <= 0 ? 'Please enter a valid positive number' : null;
              }
            });
            if (customMinutes) {
              interval = parseInt(customMinutes) * 60;
            } else {
              return;
            }
          }
          reminder.interval = interval;
          await config.update('customReminders', reminders, vscode.ConfigurationTarget.Global);
          vscode.window.showInformationMessage('Interval updated');
        }
      }
      break;

    case 'scheduleType':
      const typeChoice = await vscode.window.showQuickPick([
        { label: '$(calendar) Time-based Schedule', description: 'Show at specific times', value: 'scheduled' },
        { label: '$(history) Interval-based', description: 'Show every X minutes/hours', value: 'interval' }
      ], {
        placeHolder: `Current: ${reminder.scheduleType === 'scheduled' ? 'Time-based' : 'Interval-based'}`
      });

      if (typeChoice && typeChoice.value !== reminder.scheduleType) {
        if (typeChoice.value === 'scheduled') {
          const times = await addScheduledTime();
          if (times && times.length > 0) {
            reminder.scheduleType = 'scheduled';
            reminder.scheduledTimes = times;
            await config.update('customReminders', reminders, vscode.ConfigurationTarget.Global);
            vscode.window.showInformationMessage('Changed to time-based schedule');
          }
        } else {
          reminder.scheduleType = 'interval';
          reminder.scheduledTimes = undefined;
          await config.update('customReminders', reminders, vscode.ConfigurationTarget.Global);
          vscode.window.showInformationMessage('Changed to interval-based');
        }
      }
      break;

    case 'toggle':
      reminder.enabled = !reminder.enabled;
      await config.update('customReminders', reminders, vscode.ConfigurationTarget.Global);
      vscode.window.showInformationMessage(
        `Reminder ${reminder.enabled ? 'enabled' : 'disabled'}`
      );
      break;

    case 'delete':
      const confirm = await vscode.window.showWarningMessage(
        `Delete reminder "${reminder.title}"?`,
        { modal: true },
        'Delete'
      );
      if (confirm === 'Delete') {
        reminders.splice(index, 1);
        await config.update('customReminders', reminders, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage('Reminder deleted');
      }
      break;
  }
}

function formatSeconds(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  const parts = [];
  if (hours > 0) parts.push(`${hours} hour${hours > 1 ? 's' : ''}`);
  if (minutes > 0 || hours === 0) parts.push(`${minutes} minute${minutes !== 1 ? 's' : ''}`);

  return parts.join(' and ');
}

function getReminderDetails(reminder: ICustomReminder): string {
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

async function addScheduledTime(existingTimes?: ScheduledTime[]): Promise<ScheduledTime[] | undefined> {
  const times: ScheduledTime[] = existingTimes ? [...existingTimes] : [];

  let addingMore = true;

  while (addingMore) {
    // Get time in HH:mm format
    const timeInput = await vscode.window.showInputBox({
      prompt: 'Enter time (24-hour format)',
      placeHolder: 'e.g., 11:00 or 14:30',
      validateInput: (value) => {
        const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
        if (!timeRegex.test(value)) {
          return 'Please enter a valid time in HH:mm format (e.g., 11:00)';
        }
        return null;
      }
    });

    if (!timeInput) {
      return times.length > 0 ? times : undefined;
    }

    // Format time to ensure HH:mm with leading zeros
    const [hour, minute] = timeInput.split(':').map(Number);
    const formattedTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

    // Ask for days
    const daysChoice = await vscode.window.showQuickPick([
      { label: 'Every day', value: 'all' },
      { label: 'Weekdays (Mon-Fri)', value: 'weekdays' },
      { label: 'Weekends (Sat-Sun)', value: 'weekends' },
      { label: 'Specific days...', value: 'custom' }
    ], {
      placeHolder: 'When should this reminder show?'
    });

    if (!daysChoice) {
      return times.length > 0 ? times : undefined;
    }

    let days: number[] | undefined;

    if (daysChoice.value === 'weekdays') {
      days = [1, 2, 3, 4, 5]; // Mon-Fri
    } else if (daysChoice.value === 'weekends') {
      days = [0, 6]; // Sun, Sat
    } else if (daysChoice.value === 'custom') {
      const selectedDays = await vscode.window.showQuickPick([
        { label: 'Sunday', value: 0, picked: false },
        { label: 'Monday', value: 1, picked: false },
        { label: 'Tuesday', value: 2, picked: false },
        { label: 'Wednesday', value: 3, picked: false },
        { label: 'Thursday', value: 4, picked: false },
        { label: 'Friday', value: 5, picked: false },
        { label: 'Saturday', value: 6, picked: false }
      ], {
        placeHolder: 'Select days',
        canPickMany: true
      });

      if (!selectedDays || selectedDays.length === 0) {
        return times.length > 0 ? times : undefined;
      }

      days = selectedDays.map(d => d.value).sort();
    } else {
      days = undefined; // Every day
    }

    times.push({
      time: formattedTime,
      days: days
    });

    // Ask if user wants to add more times
    const addMore = await vscode.window.showQuickPick([
      { label: '$(add) Add another time', value: true },
      { label: '$(check) Done', value: false }
    ], {
      placeHolder: `Added: ${formattedTime} ${formatDays(days)}`
    });

    if (!addMore || !addMore.value) {
      addingMore = false;
    }
  }

  return times.length > 0 ? times : undefined;
}

function formatScheduledTimes(times: ScheduledTime[]): string {
  if (!times || times.length === 0) return 'No schedule set';

  return times.map(t => `${t.time} ${formatDays(t.days)}`).join(', ');
}

function formatDays(days?: number[]): string {
  if (!days || days.length === 0) return '(daily)';
  if (days.length === 7) return '(daily)';

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Check for weekdays
  if (days.length === 5 && days.every(d => [1, 2, 3, 4, 5].includes(d))) {
    return '(weekdays)';
  }

  // Check for weekends
  if (days.length === 2 && days.every(d => [0, 6].includes(d))) {
    return '(weekends)';
  }

  return `(${days.map(d => dayNames[d]).join(', ')})`;
}
