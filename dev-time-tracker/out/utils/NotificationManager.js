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
        'default': { duration: 0.2, type: 1, freq: 600, volume: 0.1, attack: 0.01, decay: 0.1, sustain: 0.1, release: 0.1 }
    };
    // Webview panel for notifications
    webviewPanel = null;
    constructor() {
        this.initializeAudio();
    }
    async initializeAudio() {
        try {
            // Skip in non-browser environment
            if (typeof window === 'undefined' || typeof window.AudioContext === 'undefined') {
                console.warn('Web Audio API not available in this environment');
                return;
            }
            // Initialize audio context
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) {
                console.warn('Web Audio API not supported in this browser');
                return;
            }
            this.audioContext = new AudioContext();
            // Preload all sounds
            await Promise.all(Object.entries(this.soundPresets).map(async ([name, preset]) => {
                try {
                    const wavData = this.generateWav(preset);
                    const response = await fetch(`data:audio/wav;base64,${wavData}`);
                    const arrayBuffer = await response.arrayBuffer();
                    if (this.audioContext) {
                        const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
                        this.sounds.set(name, audioBuffer);
                    }
                }
                catch (error) {
                    console.warn(`Could not load sound ${name}:`, error);
                }
            }));
        }
        catch (error) {
            console.warn('Audio initialization failed:', error);
        }
    }
    async loadSound(name, preset) {
        if (!this.audioContext)
            return;
        try {
            const wavData = this.generateWav(preset);
            const response = await fetch(`data:audio/wav;base64,${wavData}`);
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            this.sounds.set(name, audioBuffer);
        }
        catch (error) {
            console.warn(`Could not load sound ${name}:`, error);
        }
    }
    playSound(type = 'default') {
        if (!this.audioContext || type === 'none')
            return;
        const audioBuffer = this.sounds.get(type);
        if (!audioBuffer)
            return;
        try {
            const source = this.audioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(this.audioContext.destination);
            source.start();
        }
        catch (error) {
            console.warn(`Failed to play sound ${type}:`, error);
        }
    }
    generateWav(preset) {
        const { duration, type, freq, volume, attack, decay, sustain, release } = preset;
        // Simple sound generation - in a real app, you'd use pre-recorded sounds
        const sampleRate = 44100;
        const samples = Math.floor(duration * sampleRate);
        const buffer = new ArrayBuffer(44 + samples * 2);
        const view = new DataView(buffer);
        // WAV header
        this.writeString(view, 0, 'RIFF');
        view.setUint32(4, 36 + samples * 2, true);
        this.writeString(view, 8, 'WAVE');
        this.writeString(view, 12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, 1, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * 2, true);
        view.setUint16(32, 2, true);
        view.setUint16(34, 16, true);
        this.writeString(view, 36, 'data');
        view.setUint32(40, samples * 2, true);
        // Generate sound
        for (let i = 0; i < samples; i++) {
            const t = i / sampleRate;
            let value = Math.sin(2 * Math.PI * freq * t) * volume;
            // Apply envelope
            if (t < attack)
                value *= t / attack;
            else if (t < attack + decay)
                value *= 1 - (1 - sustain) * ((t - attack) / decay);
            else if (t > duration - release)
                value *= 1 - (t - (duration - release)) / release;
            const s = Math.max(-1, Math.min(1, value));
            view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        }
        return btoa(String.fromCharCode(...new Uint8Array(buffer)));
    }
    writeString(view, offset, string) {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
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