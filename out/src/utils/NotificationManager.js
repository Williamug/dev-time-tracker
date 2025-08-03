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
exports.NotificationManager = void 0;
const vscode = __importStar(require("vscode"));
class NotificationManager {
    static instance;
    static viewType = 'devTimeTracker.notification';
    audioContext = null;
    sounds = new Map();
    soundPresets = {
        'alert': { duration: 0.5, type: 2, freq: 800, volume: 0.1, attack: 0.01, decay: 0.2, sustain: 0.3, release: 0.2 },
        'success': { duration: 0.3, type: 1, freq: 1000, volume: 0.1, attack: 0.01, decay: 0.2, sustain: 0.3, release: 0.2 },
        'error': { duration: 0.5, type: 2, freq: 400, volume: 0.1, attack: 0.01, decay: 0.2, sustain: 0.3, release: 0.3 },
        'default': { duration: 0.2, type: 1, freq: 600, volume: 0.1, attack: 0.01, decay: 0.1, sustain: 0.1, release: 0.1 },
        'none': { duration: 0, type: 0, freq: 0, volume: 0, attack: 0, decay: 0, sustain: 0, release: 0 }
    };
    // Webview panel for notifications
    webviewPanel = null;
    constructor() {
        this.initializeAudioContext();
    }
    initializeAudioContext() {
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (AudioCtx) {
                this.audioContext = new AudioCtx();
            }
        }
        catch (error) {
            console.error('Error initializing audio context:', error);
        }
    }
    async loadSound(type, preset) {
        if (!this.audioContext)
            return;
        try {
            const buffer = await this.generateBeepSound(preset);
            if (buffer) {
                this.sounds.set(type, buffer);
            }
        }
        catch (error) {
            console.error(`Error loading sound ${type}:`, error);
        }
    }
    generateBeepSound(preset) {
        return new Promise((resolve, reject) => {
            if (!this.audioContext) {
                reject(new Error('Audio context not initialized'));
                return;
            }
            const { duration, type, freq = 440, volume = 0.5, attack = 0.1, decay = 0.1, sustain = 0.7, release = 0.3 } = preset;
            const sampleRate = this.audioContext.sampleRate;
            const totalSamples = Math.floor(duration * sampleRate);
            try {
                const buffer = this.audioContext.createBuffer(1, totalSamples, sampleRate);
                const data = buffer.getChannelData(0);
                // Generate sound wave
                for (let i = 0; i < totalSamples; i++) {
                    const t = i / sampleRate;
                    let value = 0;
                    // Apply ADSR envelope
                    let env = 1;
                    if (t < attack) {
                        env = t / attack;
                    }
                    else if (t < attack + decay) {
                        env = 1 - (1 - sustain) * ((t - attack) / decay);
                    }
                    else if (t > duration - release) {
                        env = sustain * (1 - (t - (duration - release)) / release);
                    }
                    else {
                        env = sustain;
                    }
                    // Generate waveform
                    if (type === 1) { // Sine
                        value = Math.sin(2 * Math.PI * freq * t);
                    }
                    else if (type === 2) { // Square
                        value = Math.sign(Math.sin(2 * Math.PI * freq * t));
                    }
                    else if (type === 3) { // Sawtooth
                        value = 2 * ((t * freq) % 1) - 1;
                    }
                    else { // Triangle
                        value = 1 - 4 * Math.abs(Math.round(t * freq) - (t * freq));
                    }
                    data[i] = value * (volume ?? 0.5) * env;
                }
                resolve(buffer);
            }
            catch (error) {
                reject(error);
            }
        });
    }
    static getInstance() {
        if (!NotificationManager.instance) {
            NotificationManager.instance = new NotificationManager();
        }
        return NotificationManager.instance;
    }
    showNotificationCard(options) {
        const { title, message, type = 'info', actions = [], timeout } = options;
        // Create a promise that will be resolved when an action is taken
        return new Promise((resolve) => {
            // Create a temporary panel for the notification
            const panel = vscode.window.createWebviewPanel(NotificationManager.viewType, title, { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true }, { enableScripts: true, retainContextWhenHidden: true });
            // Handle panel disposal
            panel.onDidDispose(() => {
                // If the panel is closed without taking an action, resolve with undefined
                if (!panel.dispose) {
                    resolve(undefined);
                }
                // Clean up the webview panel reference if it's the current one
                if (this.webviewPanel === panel) {
                    this.webviewPanel = null;
                }
            });
            // Handle messages from the webview
            panel.webview.onDidReceiveMessage(async (message) => {
                if (message.command === 'action') {
                    // Store the action to resolve the promise
                    const action = message.action;
                    // Mark that we're disposing with an action
                    panel.dispose = true;
                    // Close the panel
                    panel.dispose();
                    // Resolve the promise with the selected action
                    resolve(action);
                }
            });
            // Set the webview content
            panel.webview.html = this.getWebviewContent(panel, { title, message, type, actions, showProgress: options.showProgress, progressValue: options.progressValue });
            // Play sound if specified
            this.playSound(options.sound || (type === 'error' ? 'error' : 'default'));
            // Set a timeout if specified
            if (timeout) {
                setTimeout(() => {
                    if (!panel.dispose) {
                        panel.dispose = true;
                        panel.dispose();
                        resolve(undefined);
                    }
                }, timeout * 1000);
            }
            // Store the current panel reference
            this.webviewPanel = panel;
        });
    }
    getWebviewContent(panel, options) {
        const { title, message, type, actions, showProgress, progressValue } = options;
        const icon = this.getIconForType(type);
        const borderColor = this.getBorderColorForType(type);
        const iconColor = this.getIconColorForType(type);
        const headerBgColor = this.getHeaderBgColorForType(type);
        // Generate action buttons
        const actionButtons = actions
            .map((action) => `
        <button 
          class="action-button ${action.isPrimary ? 'primary' : 'secondary'}" 
          data-action="${action.action}"
          aria-label="${action.title}"
        >
          ${action.title}
        </button>`)
            .join('');
        // Generate progress bar if needed
        const progressBarHtml = showProgress ? `
      <div class="progress-container">
        <div class="progress-bar" style="width: ${progressValue || 0}%;"></div>
      </div>` : '';
        return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title}</title>
        <style>
          body {
            font-family: var(--vscode-font-family);
            margin: 0;
            padding: 0;
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
          }
          .notification-card {
            border-left: 4px solid ${borderColor};
            border-radius: 4px;
            background-color: var(--vscode-notifications-background);
            box-shadow: 0 0 8px rgba(0, 0, 0, 0.2);
            max-width: 400px;
            margin: 0 auto;
            overflow: hidden;
          }
          .notification-header {
            display: flex;
            align-items: center;
            padding: 12px 16px;
            background-color: ${headerBgColor};
            color: white;
          }
          .notification-icon {
            font-size: 18px;
            margin-right: 8px;
            color: ${iconColor};
          }
          .notification-title {
            font-weight: 600;
            font-size: 14px;
            margin: 0;
          }
          .notification-body {
            padding: 16px;
          }
          .notification-message {
            margin: 0 0 16px 0;
            white-space: pre-line;
            line-height: 1.5;
          }
          .notification-actions {
            display: flex;
            gap: 8px;
            margin-top: 16px;
          }
          .action-button {
            padding: 6px 12px;
            border: none;
            border-radius: 2px;
            cursor: pointer;
            font-size: 12px;
            font-weight: 600;
            transition: background-color 0.2s;
          }
          .action-button.primary {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
          }
          .action-button.primary:hover {
            background-color: var(--vscode-button-hoverBackground);
          }
          .action-button.secondary {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
          }
          .action-button.secondary:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
          }
          .progress-container {
            height: 4px;
            background-color: var(--vscode-progressBar-background);
            border-radius: 2px;
            margin-top: 12px;
            overflow: hidden;
          }
          .progress-bar {
            height: 100%;
            background-color: ${borderColor};
            transition: width 0.3s ease;
          }
        </style>
      </head>
      <body>
        <div class="notification-card">
          <div class="notification-header">
            <span class="notification-icon">${icon}</span>
            <h2 class="notification-title">${title}</h2>
          </div>
          <div class="notification-body">
            <p class="notification-message">${message}</p>
            ${progressBarHtml}
            <div class="notification-actions">
              ${actionButtons}
            </div>
          </div>
        </div>

        <script>
          (function() {
            const vscode = acquireVsCodeApi();
            const buttons = document.querySelectorAll('.action-button');
            
            buttons.forEach(button => {
              button.addEventListener('click', () => {
                const action = button.getAttribute('data-action');
                vscode.postMessage({
                  command: 'action',
                  action: action
                });
              });
            });
            
            // Auto-close after timeout if specified
            ${options.timeout ? `
            setTimeout(() => {
              vscode.postMessage({
                command: 'action',
                action: 'timeout'
              });
            }, ${options.timeout * 1000});` : ''}
          })();
        </script>
      </body>
      </html>
    `;
    }
    async playSound(type = 'default') {
        if (type === 'none' || !this.audioContext)
            return;
        try {
            // Check if the sound is already loaded
            if (!this.sounds.has(type)) {
                const preset = this.soundPresets[type];
                if (preset) {
                    await this.loadSound(type, preset);
                }
                else {
                    console.warn(`No sound preset found for type: ${type}`);
                    return;
                }
            }
            const buffer = this.sounds.get(type);
            if (!buffer)
                return;
            const source = this.audioContext.createBufferSource();
            source.buffer = buffer;
            const gainNode = this.audioContext.createGain();
            gainNode.gain.value = 1.0;
            source.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            source.start(0);
            source.onended = () => {
                source.disconnect();
                gainNode.disconnect();
            };
        }
        catch (error) {
            console.error(`Error playing sound ${type}:`, error);
        }
    }
    getIconForType(type) {
        switch (type) {
            case 'warning':
                return '';
            case 'error':
                return '❌';
            case 'success':
                return '✅';
            case 'info':
            default:
                return 'ℹ️';
        }
    }
    getBorderColorForType(type) {
        switch (type) {
            case 'warning':
                return 'var(--vscode-notificationsWarningIcon-foreground)';
            case 'error':
                return 'var(--vscode-errorForeground)';
            case 'success':
                return 'var(--vscode-testing-iconPassed)';
            case 'info':
            default:
                return 'var(--vscode-foreground)';
        }
    }
    getIconColorForType(type) {
        return this.getBorderColorForType(type);
    }
    getHeaderBgColorForType(type) {
        switch (type) {
            case 'warning':
                return 'var(--vscode-notificationsWarningIcon-foreground, rgba(255, 213, 0, 0.1))';
            case 'error':
                return 'var(--vscode-errorForeground, rgba(255, 0, 0, 0.1))';
            case 'success':
                return 'var(--vscode-testing-iconPassed, rgba(0, 255, 0, 0.1))';
            case 'info':
            default:
                return 'var(--vscode-foreground, rgba(255, 255, 255, 0.1))';
        }
    }
    dispose() {
        if (this.webviewPanel) {
            this.webviewPanel.dispose();
            this.webviewPanel = null;
        }
    }
}
exports.NotificationManager = NotificationManager;
//# sourceMappingURL=NotificationManager.js.map