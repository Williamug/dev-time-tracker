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
exports.HealthStatusBar = void 0;
const vscode = __importStar(require("vscode"));
class HealthStatusBar {
    static instance;
    statusBarItems;
    countdownIntervals;
    activeReminders;
    constructor() {
        this.statusBarItems = new Map();
        this.countdownIntervals = new Map();
        this.activeReminders = new Set();
        // Create status bar items for each reminder type
        this.createStatusBarItem('break', 0.5);
        this.createStatusBarItem('posture', 0.4);
        this.createStatusBarItem('eyeStrain', 0.3);
    }
    createStatusBarItem(type, priority) {
        try {
            console.log(`[HealthStatusBar] Creating status bar item for ${type}`);
            // Create the status bar item
            const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, priority * 1000 // Convert to proper priority range (0-1000)
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
        }
        catch (error) {
            console.error(`[HealthStatusBar] Error creating status bar item for ${type}:`, error);
        }
    }
    static getInstance() {
        if (!HealthStatusBar.instance) {
            HealthStatusBar.instance = new HealthStatusBar();
        }
        return HealthStatusBar.instance;
    }
    // Break reminder methods
    showBreakReminder(minutesUntilBreak) {
        this.updateReminder('break', minutesUntilBreak, {
            activeText: '$(alert) Take a break!',
            activeTooltip: 'Click to start a break',
            command: 'devtimetracker.startBreak',
            color: 'statusBarItem.errorBackground'
        });
    }
    updateBreakReminder(minutesUntilNext) {
        this.updateReminder('break', minutesUntilNext, {
            activeText: `$(clock) Break in ${minutesUntilNext}m`,
            activeTooltip: 'Next break reminder',
            color: 'statusBarItem.warningBackground'
        });
    }
    clearBreakReminder() {
        this.clearReminder('break');
    }
    // Posture reminder methods
    showPostureReminder(minutesUntilNext) {
        this.updateReminder('posture', minutesUntilNext, {
            activeText: '$(check) Check posture!',
            activeTooltip: 'Click to acknowledge posture check',
            command: 'devtimetracker.acknowledgePosture',
            color: 'statusBarItem.warningBackground'
        });
    }
    updatePostureReminder(minutesUntilNext) {
        this.updateReminder('posture', minutesUntilNext, {
            activeText: `$(check) Posture in ${minutesUntilNext}m`,
            activeTooltip: 'Next posture check',
            color: 'statusBarItem.warningBackground'
        });
    }
    clearPostureReminder() {
        this.clearReminder('posture');
    }
    // Eye strain reminder methods
    showEyeStrainReminder(minutesUntilNext) {
        this.updateReminder('eyeStrain', minutesUntilNext, {
            activeText: '$(eye) Rest your eyes!',
            activeTooltip: 'Click to acknowledge eye strain reminder',
            command: 'devtimetracker.acknowledgeEyeStrain',
            color: 'statusBarItem.errorBackground'
        });
    }
    updateEyeStrainReminder(minutesUntilNext) {
        this.updateReminder('eyeStrain', minutesUntilNext, {
            activeText: `$(eye) Eye rest in ${minutesUntilNext}m`,
            activeTooltip: 'Next eye rest reminder',
            color: 'statusBarItem.warningBackground'
        });
    }
    clearEyeStrainReminder() {
        this.clearReminder('eyeStrain');
    }
    // Generic reminder handler
    updateReminder(type, minutes, options) {
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
            }
            else {
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
                    }
                    else {
                        item.text = `$(clock) ${this.getReminderLabel(type)} in ${updatedMinutes}m`;
                    }
                }, 60000);
                this.countdownIntervals.set(type, interval);
            }
        }
        catch (error) {
            console.error(`[HealthStatusBar] Error in updateReminder for ${type}:`, error);
        }
    }
    getReminderLabel(type) {
        switch (type) {
            case 'break': return 'Break';
            case 'posture': return 'Posture';
            case 'eyeStrain': return 'Eye rest';
            default: return '';
        }
    }
    clearReminder(type) {
        if (type) {
            this.clearCountdown(type);
            const item = this.statusBarItems.get(type);
            if (item) {
                item.hide();
            }
            this.activeReminders.delete(type);
        }
        else {
            // Clear all reminders
            this.statusBarItems.forEach((item, reminderType) => {
                this.clearCountdown(reminderType);
                item.hide();
                this.activeReminders.delete(reminderType);
            });
        }
    }
    clearCountdown(type) {
        const interval = this.countdownIntervals.get(type);
        if (interval) {
            clearInterval(interval);
            this.countdownIntervals.delete(type);
        }
    }
    dispose() {
        this.statusBarItems.forEach((item, type) => {
            this.clearCountdown(type);
            item.dispose();
        });
        this.statusBarItems.clear();
        this.activeReminders.clear();
    }
}
exports.HealthStatusBar = HealthStatusBar;
//# sourceMappingURL=HealthStatusBar.js.map