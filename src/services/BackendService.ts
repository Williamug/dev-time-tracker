import * as vscode from 'vscode';
import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';

export interface BackendConfig {
  apiUrl: string;
  apiToken: string;
}

export interface ExtensionSetting {
  id?: number;
  key: string;
  value: any;
  user_id?: number;
  created_at?: string;
  updated_at?: string;
}

export class BackendService {
  private static instance: BackendService;
  private client: AxiosInstance;
  private isInitialized = false;
  private config: vscode.WorkspaceConfiguration;
  private context: vscode.ExtensionContext | null = null;

  private constructor() {
    this.config = vscode.workspace.getConfiguration('devtimetracker');
    const apiUrl = this.config.get<string>('apiUrl');
    
    if (!apiUrl) {
      throw new Error('API URL is not configured. Please set devtimetracker.apiUrl in your settings.');
    }

    this.client = axios.create({
      baseURL: apiUrl,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    this.initializeAxios();
  }

  private async initializeAxios() {
    // Add request interceptor for auth token
    this.client.interceptors.request.use(
      (config) => {
        const token = this.config.get('apiToken');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => {
        console.error('Request setup error:', error);
        return Promise.reject(error);
      }
    );

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
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
        } else if (error.request) {
          // The request was made but no response was received
          errorMessage = 'No response received from the server. Please check your connection.';
          console.error('Network Error:', errorMessage);
        } else {
          // Something happened in setting up the request
          errorMessage = `Error: ${error.message}`;
          console.error('Request Error:', errorMessage);
        }
        
        // Add error to the error log that can be viewed via a command
        this.logError(errorMessage);
        
        return Promise.reject(new Error(errorMessage));
      }
    );
  }

  public static getInstance(): BackendService {
    if (!BackendService.instance) {
      BackendService.instance = new BackendService();
    }
    return BackendService.instance;
  }
  
  private logError(message: string) {
    // Log errors to the extension's output channel
    const outputChannel = vscode.window.createOutputChannel('Dev Time Tracker');
    outputChannel.appendLine(`[${new Date().toISOString()}] ${message}`);
  }

  public async initialize(): Promise<boolean> {
    try {
      await this.loadSettings();
      return true;
    } catch (error) {
      console.error('Failed to initialize BackendService:', error);
      return false;
    }
  }

  private async loadSettings(): Promise<void> {
    try {
      const settings = await this.getSettings();
      if (settings) {
        // Apply settings to extension configuration
        for (const setting of settings) {
          await this.config.update(setting.key, setting.value, true);
        }
      }
    } catch (error) {
      console.warn('Failed to load settings from backend:', error);
      throw error;
    }
  }

  public async getSettings(key?: string): Promise<any> {
    try {
      const url = key ? `/api/settings/${key}` : '/api/settings';
      const response = await this.client.get(url);
      return response.data;
    } catch (error) {
      console.error('Failed to fetch settings:', error);
      throw error;
    }
  }

  public async updateSetting(key: string, value: any): Promise<any> {
    try {
      const response = await this.client.put(`/api/settings/${key}`, { value });
      return response.data;
    } catch (error) {
      console.error('Failed to update setting:', error);
      throw error;
    }
  }

  public async deleteSetting(key: string): Promise<boolean> {
    try {
      await this.client.delete(`/api/settings/${key}`);
      return true;
    } catch (error) {
      console.error('Failed to delete setting:', error);
      return false;
    }
  }

  // Extension Settings Methods
  public async getExtensionSettings(): Promise<ExtensionSetting[]> {
    try {
      const response = await this.client.get('/api/extension-settings');
      return response.data.data || [];
    } catch (error) {
      console.error('Failed to fetch extension settings:', error);
      return [];
    }
  }

  public async getExtensionSetting(key: string): Promise<ExtensionSetting | null> {
    try {
      const response = await this.client.get(`/api/extension-settings/${key}`);
      return response.data.data || null;
    } catch (error) {
      console.error(`Failed to fetch extension setting ${key}:`, error);
      return null;
    }
  }

  public async updateExtensionSetting(key: string, value: any): Promise<ExtensionSetting | null> {
    try {
      const response = await this.client.put(`/api/extension-settings/${key}`, { value });
      return response.data.data || null;
    } catch (error) {
      console.error(`Failed to update extension setting ${key}:`, error);
      throw error;
    }
  }

  public async deleteExtensionSetting(key: string): Promise<boolean> {
    try {
      await this.client.delete(`/api/extension-settings/${key}`);
      return true;
    } catch (error) {
      console.error(`Failed to delete extension setting ${key}:`, error);
      return false;
    }
  }

  // Event Methods
  public async sendEvent(eventType: string, data: any, maxRetries = 3): Promise<boolean> {
    let attempts = 0;
    let lastError: Error | null = null;

    while (attempts < maxRetries) {
      try {
        await this.client.post('/api/events', { 
          type: eventType, 
          data,
          timestamp: new Date().toISOString()
        });
        return true;
      } catch (error) {
        attempts++;
        lastError = error as Error;
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

  public async trackActivity(activityType: string, details: any = {}): Promise<boolean> {
    return this.sendEvent('activity', { type: activityType, ...details });
  }

  public async trackMetric(metricName: string, value: number, tags: Record<string, any> = {}): Promise<boolean> {
    return this.sendEvent('metric', { 
      name: metricName, 
      value,
      ...tags 
    });
  }

  // Authentication Methods
  public async login(email: string, password: string): Promise<{token: string, user: any} | null> {
    try {
      const response = await this.client.post('/api/login', { email, password });
      if (response.data.token) {
        await this.config.update('apiToken', response.data.token, true);
        this.client.defaults.headers.common['Authorization'] = `Bearer ${response.data.token}`;
        return response.data;
      }
      return null;
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    }
  }

  public async refreshToken(): Promise<boolean> {
    try {
      const response = await this.client.post('/api/token/refresh');
      if (response.data.token) {
        await this.config.update('apiToken', response.data.token, true);
        this.client.defaults.headers.common['Authorization'] = `Bearer ${response.data.token}`;
        return true;
      }
      return false;
    } catch (error) {
      console.error('Token refresh failed:', error);
      return false;
    }
  }

  // Configuration Methods
  public async syncSettings(): Promise<boolean> {
    try {
      const settings = await this.getExtensionSettings();
      if (settings && settings.length > 0) {
        for (const setting of settings) {
          await this.config.update(setting.key, setting.value, true);
        }
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to sync settings:', error);
      return false;
    }
  }

  public async getAnalyticsSummary() {
    try {
      const response = await this.client.get('/api/analytics/summary');
      return response.data;
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
      throw error;
    }
  }

  public async getProjectAnalytics(projectId: string) {
    try {
      const response = await this.client.get(`/api/analytics/projects/${projectId}`);
      return response.data;
    } catch (error) {
      console.error('Failed to fetch project analytics:', error);
      throw error;
    }
  }
}
