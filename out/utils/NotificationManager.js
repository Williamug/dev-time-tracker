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
        // Create a webview panel for rich notifications
        if (!this.webviewPanel) {
            this.webviewPanel = vscode.window.createWebviewPanel(NotificationManager.viewType, title, { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true }, { enableScripts: true, retainContextWhenHidden: true });
            this.webviewPanel.onDidDispose(() => {
                this.webviewPanel = null;
            });
            this.webviewPanel.webview.onDidReceiveMessage(async (message) => {
                if (message.command === 'action') {
                    if (this.webviewPanel) {
                        this.webviewPanel.dispose();
                    }
                }
            });
        }
        else {
            this.webviewPanel.title = title;
            this.webviewPanel.reveal();
        }
        // Play sound if specified
        this.playSound(options.sound || (type === 'error' ? 'error' : 'default'));
        // Generate HTML for the notification card
        const icon = this.getIconForType(type);
        const buttons = actions
            .map((action) => `
        <button 
          class="action-button ${action.isPrimary ? 'primary' : 'secondary'}" 
          data-action="${action.action}"
          aria-label="${action.title}"
        >
          ${action.title}
        </button>`)
            .join('');
        const progressBar = options.showProgress ? `
      <div class="progress-container">
        <div 
          class="progress-bar" 
          style="width: ${Math.min(100, Math.max(0, options.progressValue || 0))}%"
          role="progressbar"
          aria-valuenow="${options.progressValue || 0}"
          aria-valuemin="0"
          aria-valuemax="100"
        ></div>
      </div>` : '';
        const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title}</title>
        <style>
          @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
          }
          
          @keyframes progress {
            from { width: 100%; }
            to { width: 0%; }
          }
          
          body {
            font-family: var(--vscode-font-family);
            padding: 0;
            background-color: transparent;
            color: var(--vscode-foreground);
            margin: 0;
            animation: slideIn 0.3s ease-out forwards;
          }
          .notification-card {
            border-left: 4px solid ${this.getBorderColorForType(type)};
            background-color: var(--vscode-notifications-background);
            border-radius: 4px;
            box-shadow: 0 2px 8px var(--vscode-widget-shadow);
            overflow: hidden;
            max-width: 400px;
            margin: 16px;
            transition: transform 0.2s, opacity 0.2s;
          }
          
          .notification-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px var(--vscode-widget-shadow);
          }
          .notification-header {
            display: flex;
            align-items: center;
            padding: 12px 16px;
            background-color: ${this.getHeaderBgColorForType(type)};
          }
          .notification-icon {
            margin-right: 12px;
            font-size: 18px;
            color: ${this.getIconColorForType(type)};
          }
          .notification-title {
            margin: 0;
            font-weight: 600;
            font-size: 14px;
          }
          .notification-content {
            padding: 16px;
            line-height: 1.5;
            font-size: 13px;
          }
          .notification-actions {
            display: flex;
            justify-content: flex-end;
            padding: 8px 16px 12px;
            gap: 8px;
          }
          .action-button {
            padding: 6px 16px;
            border: 1px solid transparent;
            border-radius: 4px;
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            cursor: pointer;
            font-size: 12px;
            font-weight: 500;
            transition: all 0.2s ease;
            margin-left: 8px;
          }
          
          .action-button.primary {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
          }
          
          .action-button:hover {
            opacity: 0.9;
            transform: translateY(-1px);
          }
          
          .action-button:active {
            transform: translateY(0);
          }
          
          .progress-container {
            height: 4px;
            background-color: var(--vscode-progressBar-background);
            border-radius: 2px;
            margin: 8px 0;
            overflow: hidden;
          }
          
          .progress-bar {
            height: 100%;
            background-color: ${this.getBorderColorForType(type)};
            transition: width 0.3s ease;
          }
        </style>
      </head>
      <body>
        <div class="notification-card">
          <div class="notification-header">
            <span class="notification-icon">${icon}</span>
            <h3 class="notification-title">${title}</h3>
          </div>
          <div class="notification-content">
            ${message.replace(/\n/g, '<br>')}
          </div>
          ${actions.length > 0 ? `
            <div class="notification-actions">
              ${buttons}
            </div>
          ` : ''}
        </div>
        <script>
          const vscode = acquireVsCodeApi();
          document.querySelectorAll('.action-button').forEach(button => {
            button.addEventListener('click', () => {
              vscode.postMessage({
                command: 'action',
                action: button.dataset.action
              });
            });
          });
        </script>
      </body>
      </html>
    `;
        this.webviewPanel.webview.html = html;
        // Set up promise to handle actions
        return new Promise((resolve) => {
            const disposable = this.webviewPanel?.webview.onDidReceiveMessage((message) => {
                if (message.command === 'action') {
                    disposable?.dispose();
                    resolve(message.action);
                }
            });
            if (timeout) {
                setTimeout(() => {
                    if (this.webviewPanel) {
                        this.webviewPanel.dispose();
                        resolve(undefined);
                    }
                }, timeout);
            }
        });
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
                return '⚠️';
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