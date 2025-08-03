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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BackendService = void 0;
const vscode = __importStar(require("vscode"));
const axios_1 = __importDefault(require("axios"));
class BackendService {
    static instance;
    client;
    isInitialized = false;
    config;
    context = null;
    constructor() {
        this.config = vscode.workspace.getConfiguration('devtimetracker');
        const apiUrl = this.config.get('apiUrl');
        if (!apiUrl) {
            throw new Error('API URL is not configured. Please set devtimetracker.apiUrl in your settings.');
        }
        this.client = axios_1.default.create({
            baseURL: apiUrl,
            timeout: 10000,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });
        this.initializeAxios();
    }
    async initializeAxios() {
        // Add request interceptor for auth token
        this.client.interceptors.request.use((config) => {
            const token = this.config.get('apiToken');
            if (token) {
                config.headers.Authorization = `Bearer ${token}`;
            }
            return config;
        }, (error) => {
            console.error('Request setup error:', error);
            return Promise.reject(error);
        });
        // Add response interceptor for error handling
        this.client.interceptors.response.use((response) => response, (error) => {
            let errorMessage = 'An error occurred';
            if (error.response) {
                // Handle specific HTTP error statuses
                switch (error.response.status) {
                    case 401:
                        errorMessage = 'Authentication failed. Please check your API token.';
                        break;
                    case 403:
                        errorMessage = 'Permission denied. You do not have access to this resource.';
                        break;
                    case 404:
                        errorMessage = 'The requested resource was not found.';
                        break;
                    case 500:
                        errorMessage = 'An internal server error occurred. Please try again later.';
                        break;
                    default:
                        errorMessage = `Request failed with status ${error.response.status}`;
                }
                console.error('API Error:', errorMessage);
            }
            else if (error.request) {
                // The request was made but no response was received
                errorMessage = 'No response received from the server. Please check your connection.';
                console.error('Network Error:', errorMessage);
            }
            else {
                // Something happened in setting up the request
                errorMessage = `Error: ${error.message}`;
                console.error('Request Error:', errorMessage);
            }
            // Add error to the error log that can be viewed via a command
            this.logError(errorMessage);
            return Promise.reject(new Error(errorMessage));
        });
    }
    static getInstance() {
        if (!BackendService.instance) {
            BackendService.instance = new BackendService();
        }
        return BackendService.instance;
    }
    logError(message) {
        // Log errors to the extension's output channel
        const outputChannel = vscode.window.createOutputChannel('Dev Time Tracker');
        outputChannel.appendLine(`[${new Date().toISOString()}] ${message}`);
    }
    async initialize() {
        try {
            await this.loadSettings();
            return true;
        }
        catch (error) {
            console.error('Failed to initialize BackendService:', error);
            return false;
        }
    }
    async loadSettings() {
        try {
            const settings = await this.getSettings();
            if (settings) {
                // Apply settings to extension configuration
                for (const setting of settings) {
                    await this.config.update(setting.key, setting.value, true);
                }
            }
        }
        catch (error) {
            console.warn('Failed to load settings from backend:', error);
            throw error;
        }
    }
    async getSettings(key) {
        try {
            const url = key ? `/api/settings/${key}` : '/api/settings';
            const response = await this.client.get(url);
            return response.data;
        }
        catch (error) {
            console.error('Failed to fetch settings:', error);
            throw error;
        }
    }
    async updateSetting(key, value) {
        try {
            const response = await this.client.put(`/api/settings/${key}`, { value });
            return response.data;
        }
        catch (error) {
            console.error('Failed to update setting:', error);
            throw error;
        }
    }
    async deleteSetting(key) {
        try {
            await this.client.delete(`/api/settings/${key}`);
            return true;
        }
        catch (error) {
            console.error('Failed to delete setting:', error);
            return false;
        }
    }
    // Extension Settings Methods
    async getExtensionSettings() {
        try {
            const response = await this.client.get('/api/extension-settings');
            return response.data.data || [];
        }
        catch (error) {
            console.error('Failed to fetch extension settings:', error);
            return [];
        }
    }
    async getExtensionSetting(key) {
        try {
            const response = await this.client.get(`/api/extension-settings/${key}`);
            return response.data.data || null;
        }
        catch (error) {
            console.error(`Failed to fetch extension setting ${key}:`, error);
            return null;
        }
    }
    async updateExtensionSetting(key, value) {
        try {
            const response = await this.client.put(`/api/extension-settings/${key}`, { value });
            return response.data.data || null;
        }
        catch (error) {
            console.error(`Failed to update extension setting ${key}:`, error);
            throw error;
        }
    }
    async deleteExtensionSetting(key) {
        try {
            await this.client.delete(`/api/extension-settings/${key}`);
            return true;
        }
        catch (error) {
            console.error(`Failed to delete extension setting ${key}:`, error);
            return false;
        }
    }
    // Event Methods
    async sendEvent(eventType, data, maxRetries = 3) {
        let attempts = 0;
        let lastError = null;
        while (attempts < maxRetries) {
            try {
                await this.client.post('/api/events', {
                    type: eventType,
                    data,
                    timestamp: new Date().toISOString()
                });
                return true;
            }
            catch (error) {
                attempts++;
                lastError = error;
                console.error(`Failed to send event (attempt ${attempts}/${maxRetries}):`, error);
                if (attempts < maxRetries) {
                    // Exponential backoff: wait 1s, 2s, 4s, etc.
                    const delay = Math.pow(2, attempts - 1) * 1000;
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }
        console.error('All retry attempts failed for event:', eventType, 'Error:', lastError);
        return false;
    }
    async trackActivity(activityType, details = {}) {
        return this.sendEvent('activity', { type: activityType, ...details });
    }
    async trackMetric(metricName, value, tags = {}) {
        return this.sendEvent('metric', {
            name: metricName,
            value,
            ...tags
        });
    }
    // Authentication Methods
    async login(email, password) {
        try {
            const response = await this.client.post('/api/login', { email, password });
            if (response.data.token) {
                await this.config.update('apiToken', response.data.token, true);
                this.client.defaults.headers.common['Authorization'] = `Bearer ${response.data.token}`;
                return response.data;
            }
            return null;
        }
        catch (error) {
            console.error('Login failed:', error);
            throw error;
        }
    }
    async refreshToken() {
        try {
            const response = await this.client.post('/api/token/refresh');
            if (response.data.token) {
                await this.config.update('apiToken', response.data.token, true);
                this.client.defaults.headers.common['Authorization'] = `Bearer ${response.data.token}`;
                return true;
            }
            return false;
        }
        catch (error) {
            console.error('Token refresh failed:', error);
            return false;
        }
    }
    // Configuration Methods
    async syncSettings() {
        try {
            const settings = await this.getExtensionSettings();
            if (settings && settings.length > 0) {
                for (const setting of settings) {
                    await this.config.update(setting.key, setting.value, true);
                }
                return true;
            }
            return false;
        }
        catch (error) {
            console.error('Failed to sync settings:', error);
            return false;
        }
    }
    async getAnalyticsSummary() {
        try {
            const response = await this.client.get('/api/analytics/summary');
            return response.data;
        }
        catch (error) {
            console.error('Failed to fetch analytics:', error);
            throw error;
        }
    }
    async getProjectAnalytics(projectId) {
        try {
            const response = await this.client.get(`/api/analytics/projects/${projectId}`);
            return response.data;
        }
        catch (error) {
            console.error('Failed to fetch project analytics:', error);
            throw error;
        }
    }
}
exports.BackendService = BackendService;
//# sourceMappingURL=BackendService.js.map