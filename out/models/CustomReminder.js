"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CustomReminder = void 0;
class CustomReminder {
    id;
    title;
    message;
    interval;
    enabled;
    lastTriggered;
    conditions;
    notificationType;
    soundEnabled;
    actions;
    constructor(config) {
        this.id = config.id || `reminder-${Date.now()}`;
        this.title = config.title || 'Reminder';
        this.message = config.message || '';
        this.interval = config.interval || 1800; // 30 minutes by default
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
    shouldTrigger(typingStats, activeDocumentLanguage, sessionDuration) {
        if (!this.enabled)
            return false;
        // Check if enough time has passed since last trigger
        const now = Date.now();
        if (this.lastTriggered && now - this.lastTriggered < this.interval * 1000) {
            return false;
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
    toJSON() {
        return {
            id: this.id,
            title: this.title,
            message: this.message,
            interval: this.interval,
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
    static fromJSON(data) {
        return new CustomReminder({
            id: data.id,
            title: data.title,
            message: data.message,
            interval: data.interval,
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
    clone() {
        return CustomReminder.fromJSON(this.toJSON());
    }
}
exports.CustomReminder = CustomReminder;
//# sourceMappingURL=CustomReminder.js.map