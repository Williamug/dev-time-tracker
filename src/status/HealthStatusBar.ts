import * as vscode from 'vscode';

type ReminderType = 'break' | 'posture' | 'eyeStrain';

interface ReminderOptions {
  activeText: string;
  activeTooltip: string;
  command?: string;
  color: string;
}

export class HealthStatusBar {
  private static instance: HealthStatusBar;
  private statusBarItems: Map<ReminderType, vscode.StatusBarItem>;
  private countdownIntervals: Map<ReminderType, NodeJS.Timeout>;
  private activeReminders: Set<ReminderType>;

  private constructor() {
    this.statusBarItems = new Map();
    this.countdownIntervals = new Map();
    this.activeReminders = new Set();

    // Create status bar items for each reminder type
    this.createStatusBarItem('break', 0.5);
    this.createStatusBarItem('posture', 0.4);
    this.createStatusBarItem('eyeStrain', 0.3);
  }

  private createStatusBarItem(type: ReminderType, priority: number): void {
    try {
      console.log(`[HealthStatusBar] Creating status bar item for ${type}`);
      
      // Create the status bar item
      const item = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Left,
        priority * 1000 // Convert to proper priority range (0-1000)
      );
      
      // Set default properties
      const icon = type === 'break' ? '$(clock)' : 
                  type === 'posture' ? '$(symbol-method)' : '$(eye)';
      
      item.text = icon;
      item.tooltip = `Dev Time Tracker - ${this.getReminderLabel(type)}`;
      item.command = `devtimetracker.${type}Reminder`;
      
      // Force show the item
      item.show();
      console.log(`[HealthStatusBar] Status bar item created for ${type}:`, item);
      
      // Store the item
      this.statusBarItems.set(type, item);
      
    } catch (error) {
      console.error(`[HealthStatusBar] Error creating status bar item for ${type}:`, error);
    }
  }

  public static getInstance(): HealthStatusBar {
    if (!HealthStatusBar.instance) {
      HealthStatusBar.instance = new HealthStatusBar();
    }
    return HealthStatusBar.instance;
  }

  // Break reminder methods
  public showBreakReminder(minutesUntilBreak: number): void {
    this.updateReminder('break', minutesUntilBreak, {
      activeText: '$(alert) Take a break!',
      activeTooltip: 'Click to start a break',
      command: 'devtimetracker.startBreak',
      color: 'statusBarItem.errorBackground'
    });
  }

  public updateBreakReminder(minutesUntilNext: number): void {
    this.updateReminder('break', minutesUntilNext, {
      activeText: `$(clock) Break in ${minutesUntilNext}m`,
      activeTooltip: 'Next break reminder',
      color: 'statusBarItem.warningBackground'
    });
  }

  public clearBreakReminder(): void {
    this.clearReminder('break');
  }

  // Posture reminder methods
  public showPostureReminder(minutesUntilNext: number): void {
    this.updateReminder('posture', minutesUntilNext, {
      activeText: '$(check) Check posture!',
      activeTooltip: 'Click to acknowledge posture check',
      command: 'devtimetracker.acknowledgePosture',
      color: 'statusBarItem.warningBackground'
    });
  }

  public updatePostureReminder(minutesUntilNext: number): void {
    this.updateReminder('posture', minutesUntilNext, {
      activeText: `$(check) Posture in ${minutesUntilNext}m`,
      activeTooltip: 'Next posture check',
      color: 'statusBarItem.warningBackground'
    });
  }

  public clearPostureReminder(): void {
    this.clearReminder('posture');
  }

  // Eye strain reminder methods
  public showEyeStrainReminder(minutesUntilNext: number): void {
    this.updateReminder('eyeStrain', minutesUntilNext, {
      activeText: '$(eye) Rest your eyes!',
      activeTooltip: 'Click to acknowledge eye strain reminder',
      command: 'devtimetracker.acknowledgeEyeStrain',
      color: 'statusBarItem.errorBackground'
    });
  }

  public updateEyeStrainReminder(minutesUntilNext: number): void {
    this.updateReminder('eyeStrain', minutesUntilNext, {
      activeText: `$(eye) Eye rest in ${minutesUntilNext}m`,
      activeTooltip: 'Next eye rest reminder',
      color: 'statusBarItem.warningBackground'
    });
  }

  public clearEyeStrainReminder(): void {
    this.clearReminder('eyeStrain');
  }

  // Generic reminder handler
  private updateReminder(
    type: ReminderType,
    minutes: number,
    options: ReminderOptions
  ): void {
    try {
      console.log(`[HealthStatusBar] Updating reminder for ${type}:`, { minutes, options });
      
      // Clear any existing interval
      this.clearCountdown(type);

      const item = this.statusBarItems.get(type);
      if (!item) {
        console.error(`[HealthStatusBar] No status bar item found for ${type}`);
        return;
      }

      // Update immediately
      if (minutes <= 0) {
        item.text = options.activeText;
        item.tooltip = options.activeTooltip;
        item.backgroundColor = new vscode.ThemeColor(options.color);
        if (options.command) {
          item.command = options.command;
        }
        this.activeReminders.add(type);
      } else {
        item.text = `$(clock) ${this.getReminderLabel(type)} in ${minutes}m`;
        item.tooltip = options.activeTooltip;
        item.backgroundColor = undefined;
        item.command = undefined;
        this.activeReminders.delete(type);
      }

      // Show the status bar item
      item.show();

      // Update every minute if it's an active reminder
      if (minutes > 0) {
        const interval = setInterval(() => {
          const updatedMinutes = minutes - 1;
          if (updatedMinutes <= 0) {
            this.updateReminder(type, 0, options);
          } else {
            item.text = `$(clock) ${this.getReminderLabel(type)} in ${updatedMinutes}m`;
          }
        }, 60000);

        this.countdownIntervals.set(type, interval);
      }
    } catch (error) {
      console.error(`[HealthStatusBar] Error in updateReminder for ${type}:`, error);
    }
  }

  private getReminderLabel(type: ReminderType): string {
    switch (type) {
      case 'break': return 'Break';
      case 'posture': return 'Posture';
      case 'eyeStrain': return 'Eye rest';
      default: return '';
    }
  }

  public clearReminder(type?: ReminderType): void {
    if (type) {
      this.clearCountdown(type);
      const item = this.statusBarItems.get(type);
      if (item) {
        item.hide();
      }
      this.activeReminders.delete(type);
    } else {
      // Clear all reminders
      this.statusBarItems.forEach((item, reminderType) => {
        this.clearCountdown(reminderType);
        item.hide();
        this.activeReminders.delete(reminderType);
      });
    }
  }

  private clearCountdown(type: ReminderType): void {
    const interval = this.countdownIntervals.get(type);
    if (interval) {
      clearInterval(interval);
      this.countdownIntervals.delete(type);
    }
  }

  public dispose(): void {
    this.statusBarItems.forEach((item, type) => {
      this.clearCountdown(type);
      item.dispose();
    });
    this.statusBarItems.clear();
    this.activeReminders.clear();
  }
}
