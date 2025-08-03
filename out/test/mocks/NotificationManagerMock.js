"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationManagerMock = void 0;
class NotificationManagerInstance {
    // Track notifications for testing
    notifications = [];
    constructor() {
        // Mock the showNotificationCard method
        this.showNotificationCard = jest.fn().mockImplementation((title, message, type, actions = []) => {
            this.notifications.push({ title, message, type, actions });
            return Promise.resolve();
        });
    }
    // Mock method that matches the real NotificationManager interface
    showNotificationCard;
    // Helper method to get the last notification
    getLastNotification() {
        return this.notifications.length > 0
            ? this.notifications[this.notifications.length - 1]
            : null;
    }
    // Helper method to clear all notifications
    clearNotifications() {
        this.notifications = [];
    }
    // Mock other NotificationManager methods as needed
    showInformationMessage = jest.fn().mockImplementation((message, ...items) => {
        return Promise.resolve({ title: items[0] });
    });
    showWarningMessage = jest.fn().mockImplementation((message, ...items) => {
        return Promise.resolve({ title: items[0] });
    });
    showErrorMessage = jest.fn().mockImplementation((message, ...items) => {
        return Promise.resolve({ title: items[0] });
    });
}
// Singleton instance for the mock
let instance = null;
class NotificationManagerMock {
    static viewType = 'notification-manager';
    // Singleton instance getter
    static getInstance() {
        if (!instance) {
            instance = new NotificationManagerInstance();
        }
        return instance;
    }
    // Reset the singleton instance (for testing)
    static resetInstance() {
        instance = null;
    }
}
exports.NotificationManagerMock = NotificationManagerMock;
exports.default = NotificationManagerMock;
//# sourceMappingURL=NotificationManagerMock.js.map