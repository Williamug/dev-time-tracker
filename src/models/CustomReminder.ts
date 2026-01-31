import * as vscode from 'vscode';

export interface ICustomReminderAction {
  title: string;
  action: string;
  isPrimary?: boolean;
}

export interface ICustomReminderConditions {
  minTypingSpeed?: number; // WPM
  maxTypingSpeed?: number; // WPM
  activeDocumentLanguage?: string[];
  minSessionDuration?: number; // in seconds
}

export type NotificationType = 'info' | 'warning' | 'error' | 'none';
export type ScheduleType = 'interval' | 'scheduled';

export interface ScheduledTime {
  time: string; // HH:mm format (24-hour)
  days?: number[]; // 0-6 (Sunday-Saturday), empty means every day
}

export interface ICustomReminder {
  id: string;
  title: string;
  message: string;
  interval: number; // in seconds (used when scheduleType is 'interval')
  scheduleType: ScheduleType; // 'interval' or 'scheduled'
  scheduledTimes?: ScheduledTime[]; // used when scheduleType is 'scheduled'
  enabled: boolean;
  lastTriggered?: number;
  conditions?: ICustomReminderConditions;
  notificationType: NotificationType;
  soundEnabled: boolean;
  actions: ICustomReminderAction[];
}

export class CustomReminder implements ICustomReminder {
  id: string;
  title: string;
  message: string;
  interval: number;
  scheduleType: ScheduleType;
  scheduledTimes?: ScheduledTime[];
  enabled: boolean;
  lastTriggered?: number;
  conditions?: ICustomReminderConditions;
  notificationType: NotificationType;
  soundEnabled: boolean;
  actions: ICustomReminderAction[];

  constructor(config: Partial<ICustomReminder>) {
    this.id = config.id || `reminder-${Date.now()}`;
    this.title = config.title || 'Reminder';
    this.message = config.message || '';
    this.interval = config.interval || 1800; // 30 minutes by default
    this.scheduleType = config.scheduleType || 'interval';
    this.scheduledTimes = config.scheduledTimes || [];
    this.enabled = config.enabled !== undefined ? config.enabled : true;
    this.lastTriggered = config.lastTriggered;
    this.conditions = config.conditions || {};
    this.notificationType = config.notificationType || 'info';
    this.soundEnabled = config.soundEnabled !== undefined ? config.soundEnabled : true;
    this.actions = config.actions || [
      { title: 'Snooze', action: 'snooze' },
      { title: 'Dismiss', action: 'dismiss', isPrimary: true }
    ];
  }

  shouldTrigger(typingStats?: { speed: number }, activeDocumentLanguage?: string, sessionDuration?: number): boolean {
    if (!this.enabled) return false;

    const now = Date.now();

    // Handle scheduled reminders
    if (this.scheduleType === 'scheduled' && this.scheduledTimes && this.scheduledTimes.length > 0) {
      const currentDate = new Date(now);
      const currentDay = currentDate.getDay(); // 0-6 (Sunday-Saturday)
      const currentTime = `${String(currentDate.getHours()).padStart(2, '0')}:${String(currentDate.getMinutes()).padStart(2, '0')}`;

      // Check if current time matches any scheduled time
      const matchesSchedule = this.scheduledTimes.some(schedule => {
        // Check if time matches (with 1-minute tolerance)
        const [scheduleHour, scheduleMinute] = schedule.time.split(':').map(Number);
        const scheduleTimeMinutes = scheduleHour * 60 + scheduleMinute;
        const currentTimeMinutes = currentDate.getHours() * 60 + currentDate.getMinutes();

        const timeMatches = Math.abs(scheduleTimeMinutes - currentTimeMinutes) <= 1;

        // Check if day matches (if days specified)
        const dayMatches = !schedule.days || schedule.days.length === 0 || schedule.days.includes(currentDay);

        return timeMatches && dayMatches;
      });

      if (!matchesSchedule) {
        return false;
      }

      // Prevent triggering multiple times within the same minute
      if (this.lastTriggered && now - this.lastTriggered < 60 * 1000) {
        return false;
      }
    } else {
      // Handle interval-based reminders
      // Check if enough time has passed since last trigger
      if (this.lastTriggered && now - this.lastTriggered < this.interval * 1000) {
        return false;
      }
    }

    // Check typing speed conditions
    if (typingStats) {
      if (this.conditions?.minTypingSpeed !== undefined && typingStats.speed < this.conditions.minTypingSpeed) {
        return false;
      }
      if (this.conditions?.maxTypingSpeed !== undefined && typingStats.speed > this.conditions.maxTypingSpeed) {
        return false;
      }
    }

    // Check document language conditions
    if (activeDocumentLanguage && this.conditions?.activeDocumentLanguage?.length) {
      if (!this.conditions.activeDocumentLanguage.includes(activeDocumentLanguage)) {
        return false;
      }
    }

    // Check session duration conditions
    if (sessionDuration !== undefined && this.conditions?.minSessionDuration !== undefined) {
      if (sessionDuration < this.conditions.minSessionDuration) {
        return false;
      }
    }

    return true;
  }

  /**
   * Serializes the reminder to a plain object for storage
   */
  toJSON(): ICustomReminder {
    return {
      id: this.id,
      title: this.title,
      message: this.message,
      interval: this.interval,
      scheduleType: this.scheduleType,
      scheduledTimes: this.scheduledTimes ? [...this.scheduledTimes] : undefined,
      enabled: this.enabled,
      lastTriggered: this.lastTriggered,
      conditions: this.conditions ? { ...this.conditions } : undefined,
      notificationType: this.notificationType,
      soundEnabled: this.soundEnabled,
      actions: this.actions.map(action => ({
        title: action.title,
        action: action.action,
        isPrimary: action.isPrimary
      }))
    };
  }

  /**
   * Creates a new CustomReminder instance from a plain object
   */
  static fromJSON(data: Partial<ICustomReminder>): CustomReminder {
    return new CustomReminder({
      id: data.id,
      title: data.title,
      message: data.message,
      interval: data.interval,
      scheduleType: data.scheduleType || 'interval',
      scheduledTimes: data.scheduledTimes ? [...data.scheduledTimes] : undefined,
      enabled: data.enabled,
      lastTriggered: data.lastTriggered,
      conditions: data.conditions ? { ...data.conditions } : undefined,
      notificationType: data.notificationType || 'info',
      soundEnabled: data.soundEnabled !== undefined ? data.soundEnabled : true,
      actions: (data.actions || []).map(action => ({
        title: action.title,
        action: action.action,
        isPrimary: action.isPrimary
      }))
    });
  }

  /**
   * Creates a deep clone of the reminder
   */
  clone(): CustomReminder {
    return CustomReminder.fromJSON(this.toJSON());
  }
}
