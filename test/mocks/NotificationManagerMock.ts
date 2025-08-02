import * as vscode from 'vscode';

class NotificationManagerInstance {
  // Track notifications for testing
  public notifications: Array<{
    title: string;
    message: string;
    type: string;
    actions: vscode.MessageItem[];
  }> = [];

  constructor() {
    // Mock the showNotificationCard method
    this.showNotificationCard = jest.fn().mockImplementation((title: string, message: string, type: string, actions: vscode.MessageItem[] = []) => {
      this.notifications.push({ title, message, type, actions });
      return Promise.resolve();
    });
  }

  // Mock method that matches the real NotificationManager interface
  public showNotificationCard: (
    title: string,
    message: string,
    type: string,
    actions?: vscode.MessageItem[],
    options?: { showInStatusBar?: boolean }
  ) => Promise<void>;

  // Helper method to get the last notification
  public getLastNotification() {
    return this.notifications.length > 0 
      ? this.notifications[this.notifications.length - 1] 
      : null;
  }

  // Helper method to clear all notifications
  public clearNotifications() {
    this.notifications = [];
  }

  // Mock other NotificationManager methods as needed
  public showInformationMessage = jest.fn().mockImplementation((message: string, ...items: any[]) => {
    return Promise.resolve({ title: items[0] } as vscode.MessageItem);
  });

  public showWarningMessage = jest.fn().mockImplementation((message: string, ...items: any[]) => {
    return Promise.resolve({ title: items[0] } as vscode.MessageItem);
  });

  public showErrorMessage = jest.fn().mockImplementation((message: string, ...items: any[]) => {
    return Promise.resolve({ title: items[0] } as vscode.MessageItem);
  });
}

// Singleton instance for the mock
let instance: NotificationManagerInstance | null = null;

export class NotificationManagerMock {
  public static viewType = 'notification-manager';
  
  // Singleton instance getter
  public static getInstance(): NotificationManagerInstance {
    if (!instance) {
      instance = new NotificationManagerInstance();
    }
    return instance;
  }

  // Reset the singleton instance (for testing)
  public static resetInstance() {
    instance = null;
  }
}

export default NotificationManagerMock;
