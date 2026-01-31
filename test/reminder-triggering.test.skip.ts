import * as vscode from 'vscode';
import { CustomReminderService } from '../src/services/CustomReminderService';
import { CustomReminder, ICustomReminder, ICustomReminderConditions } from '../src/models/CustomReminder';
import { IMetricsProvider } from '../src/models/IMetricsProvider';
import { NotificationManager } from '../src/utils/NotificationManager';

// Mock the NotificationManager module
jest.mock('../src/utils/NotificationManager', () => {
  // Create a mock implementation that maintains the singleton pattern
  let instance: any = null;
  
  const MockNotificationManager = {
    getInstance: jest.fn().mockImplementation(() => {
      if (!instance) {
        instance = {
          notifications: [],
          showNotificationCard: jest.fn().mockImplementation((options) => {
            instance.notifications.push(options);
            return Promise.resolve();
          }),
          clearNotifications: jest.fn().mockImplementation(() => {
            instance.notifications = [];
          }),
          getLastNotification: jest.fn().mockImplementation(() => {
            return instance.notifications.length > 0 
              ? instance.notifications[instance.notifications.length - 1] 
              : null;
          }),
          showInformationMessage: jest.fn().mockImplementation((message: string, ...items: any[]) => {
            return Promise.resolve({ title: items[0] } as vscode.MessageItem);
          }),
          showWarningMessage: jest.fn().mockImplementation((message: string, ...items: any[]) => {
            return Promise.resolve({ title: items[0] } as vscode.MessageItem);
          }),
          showErrorMessage: jest.fn().mockImplementation((message: string, ...items: any[]) => {
            return Promise.resolve({ title: items[0] } as vscode.MessageItem);
          }),
        };
      }
      return instance;
    }),
    // Add any static properties used by the NotificationManager
    viewType: 'devTimeTracker.notification',
  };

  return {
    __esModule: true,
    default: MockNotificationManager,
    NotificationManager: MockNotificationManager,
  };
});

type NotificationType = 'info' | 'warning' | 'error' | 'none';

// Mock metrics provider for testing reminder triggering
class MockMetricsProvider implements IMetricsProvider {
  private typingSpeed = 0;
  private sessionDuration = 0;
  private activeLanguage = 'typescript';

  setTypingSpeed(speed: number) {
    this.typingSpeed = speed;
  }

  setSessionDuration(duration: number) {
    this.sessionDuration = duration;
  }

  setActiveLanguage(language: string) {
    this.activeLanguage = language;
  }

  getTypingStats() {
    return { speed: this.typingSpeed, accuracy: 95 };
  }

  getCurrentSessionDuration() {
    return this.sessionDuration;
  }

  getActiveDocumentLanguage() {
    return this.activeLanguage;
  }
}

describe('CustomReminderService - Reminder Triggering', () => {
  let mockContext: vscode.ExtensionContext;
  let mockMetricsProvider: MockMetricsProvider;
  let service: CustomReminderService;
  
  beforeEach(async () => {
    // Reset the singleton instance before each test
    if (CustomReminderService['resetInstance']) {
      CustomReminderService['resetInstance']();
    }
    
    // Create a mock extension context
    mockContext = {
      globalState: {
        get: jest.fn().mockReturnValue([]), // Empty reminders by default
        update: jest.fn().mockResolvedValue(undefined),
      },
      subscriptions: [],
    } as unknown as vscode.ExtensionContext;
    
    // Create and configure mock metrics provider
    mockMetricsProvider = new MockMetricsProvider();
    mockMetricsProvider.setTypingSpeed(30);
    mockMetricsProvider.setSessionDuration(300); // 5 minutes
    
    // Initialize service with mock metrics provider
    service = CustomReminderService.getInstance(mockContext, mockMetricsProvider);
    
    // Wait for initialization to complete
    await new Promise(resolve => setTimeout(resolve, 0));
  });
  
  afterEach(() => {
    // Clean up after each test
    if (CustomReminderService['resetInstance']) {
      CustomReminderService['resetInstance']();
    }
  });

  // Reset the NotificationManager mock before each test
  let notificationManager: any;
  
  beforeEach(() => {
    // Get a fresh instance of the NotificationManager mock
    const NotificationManager = require('../src/utils/NotificationManager').default;
    notificationManager = NotificationManager.getInstance();
    // Clear any existing notifications
    notificationManager.clearNotifications();
  });

  it('should trigger reminder when typing speed condition is met', async () => {
    // Create a reminder that triggers when typing speed is below 40 WPM
    const reminder: ICustomReminder = {
      id: 'test-typing-speed',
      title: 'Typing Speed Alert',
      message: 'Your typing speed seems slow. Take a break!',
      interval: 300, // 5 minutes
      enabled: true,
      conditions: {
        maxTypingSpeed: 40
      },
      notificationType: 'info',
      soundEnabled: false,
      actions: []
    };
    
    // Add the reminder
    await service.addReminder(reminder);
    
    // Get the NotificationManager mock instance
    const notificationManager = require('../src/utils/NotificationManager').default.getInstance();
    
    // Trigger the check
    await (service as any).checkReminders();
    
    // Verify the reminder was triggered through NotificationManager
    const lastNotification = notificationManager.getLastNotification();
    expect(lastNotification).not.toBeNull();
    expect(lastNotification?.title).toBe('Typing Speed Alert');
    expect(lastNotification?.message).toContain('Your typing speed seems slow');
    expect(lastNotification?.type).toBe('info');
  });

  it('should not trigger reminder when conditions are not met', async () => {
    // Set typing speed above the threshold
    mockMetricsProvider.setTypingSpeed(60);
    
    // Create a reminder that triggers when typing speed is below 40 WPM
    const reminder: ICustomReminder = {
      id: 'test-typing-speed',
      title: 'Typing Speed Alert',
      message: 'Your typing speed seems slow. Take a break!',
      interval: 300,
      enabled: true,
      conditions: {
        maxTypingSpeed: 40
      },
      notificationType: 'info',
      soundEnabled: false,
      actions: []
    };
    
    // Add the reminder
    await service.addReminder(reminder);
    
    // Get the NotificationManager mock instance
    const notificationManager = require('../src/utils/NotificationManager').default.getInstance();
    
    // Clear any previous notifications
    notificationManager.clearNotifications();
    
    // Trigger the check
    await (service as any).checkReminders();
    
    // Verify the reminder was not triggered
    const lastNotification = notificationManager.getLastNotification();
    expect(lastNotification).toBeNull();
  });

  it('should respect snooze duration', async () => {
    // Create a reminder that triggers immediately
    const reminder: ICustomReminder = {
      id: 'test-snooze',
      title: 'Snooze Test',
      message: 'This is a snooze test',
      interval: 300, // 5 minutes
      enabled: true,
      conditions: {},
      notificationType: 'info',
      soundEnabled: false,
      actions: []
    };
    
    // Add the reminder
    await service.addReminder(reminder);
    
    // Get the NotificationManager mock instance
    const notificationManager = require('../src/utils/NotificationManager').default.getInstance();
    
    // First check - should trigger the reminder
    await (service as any).checkReminders();
    
    // Verify the reminder was triggered
    let lastNotification = notificationManager.getLastNotification();
    expect(lastNotification).not.toBeNull();
    
    // Reset notifications
    notificationManager.clearNotifications();
    
    // Second check immediately after - should not trigger because of snooze
    await (service as any).checkReminders();
    lastNotification = notificationManager.getLastNotification();
    expect(lastNotification).toBeNull();
  });

  it('should trigger reminder when session duration condition is met', async () => {
    // Set session duration to 25 minutes
    mockMetricsProvider.setSessionDuration(1500);
    
    // Create a reminder that triggers after 20 minutes of coding
    const reminder: ICustomReminder = {
      id: 'test-session-duration',
      title: 'Session Duration Alert',
      message: 'You\'ve been coding for a while. Take a break!',
      interval: 300, // 5 minutes
      enabled: true,
      conditions: {
        minSessionDuration: 20 * 60 // 20 minutes in seconds
      },
      notificationType: 'info',
      soundEnabled: false,
      actions: []
    };
    
    // Add the reminder
    await service.addReminder(reminder);
    
    // Get the NotificationManager mock instance
    const notificationManager = require('../src/utils/NotificationManager').default.getInstance();
    
    // Trigger the check
    await (service as any).checkReminders();
    
    // Verify the reminder was triggered through NotificationManager
    const lastNotification = notificationManager.getLastNotification();
    expect(lastNotification).not.toBeNull();
    expect(lastNotification?.title).toBe('Session Duration Alert');
    expect(lastNotification?.message).toContain('You\'ve been coding for a while');
    expect(lastNotification?.type).toBe('info');
  });

  it('should trigger reminder when language condition is met', async () => {
    // Set active language to 'javascript'
    mockMetricsProvider.setActiveLanguage('javascript');
    
    // Create a reminder that triggers when working with JavaScript
    const reminder: ICustomReminder = {
      id: 'test-language',
      title: 'Language Specific Reminder',
      message: 'Remember to add JSDoc comments to your JavaScript code!',
      interval: 300, // 5 minutes
      enabled: true,
      conditions: {
        activeDocumentLanguage: ['javascript']
      },
      notificationType: 'info',
      soundEnabled: false,
      actions: []
    };
    
    // Add the reminder
    await service.addReminder(reminder);
    
    // Get the NotificationManager mock instance
    const notificationManager = require('../src/utils/NotificationManager').default.getInstance();
    
    // Trigger the check
    await (service as any).checkReminders();
    
    // Verify the reminder was triggered through NotificationManager
    const lastNotification = notificationManager.getLastNotification();
    expect(lastNotification).not.toBeNull();
    expect(lastNotification?.title).toBe('Language Specific Reminder');
    expect(lastNotification?.message).toContain('Remember to add JSDoc comments');
    expect(lastNotification?.type).toBe('info');
  });
});
