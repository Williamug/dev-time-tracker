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
exports.MetricsCollector = void 0;
const vscode = __importStar(require("vscode"));
class MetricsCollector {
    static instance;
    metrics = {};
    updateListeners = [];
    constructor() {
        this.initializeMetrics();
    }
    static getInstance() {
        if (!MetricsCollector.instance) {
            MetricsCollector.instance = new MetricsCollector();
        }
        return MetricsCollector.instance;
    }
    initializeMetrics() {
        this.metrics = {
            timestamp: new Date(),
            sessionId: this.generateSessionId(),
            userId: vscode.env.machineId,
            environment: {
                os: process.platform,
                vscodeVersion: vscode.version,
                extensionVersion: vscode.extensions.getExtension('williamug.dev-time-tracker')?.packageJSON?.version || '0.0.0'
            },
            code: this.getInitialCodeMetrics(),
            productivity: this.getInitialProductivityMetrics(),
            project: this.getInitialProjectMetrics(),
            health: this.getInitialHealthMetrics(),
            quality: this.getInitialQualityMetrics()
        };
    }
    // ... (Helper methods for initializing metrics)
    updateMetrics(updates) {
        this.metrics = { ...this.metrics, ...updates, timestamp: new Date() };
        this.notifyListeners();
    }
    getMetrics() {
        return { ...this.metrics };
    }
    addUpdateListener(listener) {
        this.updateListeners.push(listener);
    }
    notifyListeners() {
        this.updateListeners.forEach(listener => listener(this.getMetrics()));
    }
    generateSessionId() {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
    getInitialCodeMetrics() {
        return {
            lines: { added: 0, removed: 0, total: 0 },
            files: { modified: 0, created: 0, deleted: 0 },
            fileTypes: {},
            complexity: { max: 0, average: 0 }
        };
    }
    getInitialProductivityMetrics() {
        return {
            focusTime: 0,
            distractedTime: 0,
            productiveHours: {},
            dailyGoals: { target: 240, current: 0, streak: 0 } // 4 hours default target
        };
    }
    getInitialProjectMetrics() {
        return {
            currentProject: '',
            projects: {}
        };
    }
    getInitialHealthMetrics() {
        return {
            lastBreak: new Date(),
            breakReminders: true,
            typingStats: { speed: 0, accuracy: 100, heatmap: {} },
            postureReminders: true,
            eyeStrainReminders: true
        };
    }
    getInitialQualityMetrics() {
        return {
            lintErrors: 0,
            testCoverage: 0,
            testPassRate: 0,
            codeReviewTime: 0,
            techDebt: 0
        };
    }
}
exports.MetricsCollector = MetricsCollector;
//# sourceMappingURL=Metrics.js.map