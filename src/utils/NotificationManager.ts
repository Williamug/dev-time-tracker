import * as vscode from 'vscode';

// Type definitions for the notification system
type SoundType = 'alert' | 'success' | 'error' | 'default' | 'none';
type NotificationType = 'info' | 'warning' | 'error' | 'success';

interface SoundPreset {
  duration: number;
  type: number;
  freq: number;
  volume: number;
  attack: number;
  decay: number;
  sustain: number;
  release: number;
}

interface NotificationAction {
  title: string;
  action: string;
  isPrimary?: boolean;
}

interface NotificationOptions {
  title: string;
  message: string;
  type?: NotificationType;
  actions?: NotificationAction[];
  timeout?: number;
  showProgress?: boolean;
  progressValue?: number;
  sound?: SoundType;
}

// Web Audio API type definitions
declare global {
  interface AudioContextOptions {
    latencyHint?: 'balanced' | 'interactive' | 'playback' | number;
    sampleRate?: number;
  }

  interface AudioContext extends EventTarget {
    readonly sampleRate: number;
    readonly currentTime: number;
    readonly state: 'suspended' | 'running' | 'closed';
    readonly destination: AudioDestinationNode;
    close(): Promise<void>;
    resume(): Promise<void>;
    suspend(): Promise<void>;
    createBuffer(numberOfChannels: number, length: number, sampleRate: number): AudioBuffer;
    createBufferSource(): AudioBufferSourceNode;
    createOscillator(): OscillatorNode;
    createGain(): GainNode;
    decodeAudioData(audioData: ArrayBuffer): Promise<AudioBuffer>;
  }

  interface AudioBuffer {
    readonly sampleRate: number;
    readonly length: number;
    readonly duration: number;
    readonly numberOfChannels: number;
    getChannelData(channel: number): Float32Array;
    copyFromChannel(destination: Float32Array, channelNumber: number, startInChannel?: number): void;
    copyToChannel(source: Float32Array, channelNumber: number, startInChannel?: number): void;
  }

  interface AudioBufferSourceNode extends EventTarget {
    buffer: AudioBuffer | null;
    loop: boolean;
    playbackRate: AudioParam;
    detune: AudioParam;
    onended: ((this: AudioBufferSourceNode, ev: Event) => void) | null;
    start(when?: number, offset?: number, duration?: number): void;
    stop(when?: number): void;
    connect(destination: AudioNode, output?: number, input?: number): AudioNode;
    connect(destination: AudioParam, output?: number): void;
    disconnect(): void;
  }

  interface OscillatorNode extends AudioNode {
    type: OscillatorType;
    frequency: AudioParam;
    detune: AudioParam;
    onended: ((this: OscillatorNode, ev: Event) => void) | null;
    start(when?: number): void;
    stop(when?: number): void;
    setPeriodicWave(periodicWave: PeriodicWave): void;
  }

  interface GainNode extends AudioNode {
    gain: AudioParam;
  }

  interface AudioParam {
    value: number;
    automationRate: 'a-rate' | 'k-rate';
    defaultValue: number;
    maxValue: number;
    minValue: number;
    setValueAtTime(value: number, startTime: number): AudioParam;
    linearRampToValueAtTime(value: number, endTime: number): AudioParam;
    exponentialRampToValueAtTime(value: number, endTime: number): AudioParam;
    setTargetAtTime(target: number, startTime: number, timeConstant: number): AudioParam;
    setValueCurveAtTime(values: Float32Array, startTime: number, duration: number): AudioParam;
    cancelScheduledValues(cancelTime: number): AudioParam;
    cancelAndHoldAtTime(cancelTime: number): AudioParam;
  }

  interface AudioDestinationNode extends AudioNode {
    maxChannelCount: number;
  }

  interface AudioNode extends EventTarget {
    connect(destinationNode: AudioNode, output?: number, input?: number): AudioNode;
    connect(destinationParam: AudioParam, output?: number): void;
    disconnect(): void;
    disconnect(output: number): void;
    disconnect(destinationNode: AudioNode): void;
    disconnect(destinationNode: AudioNode, output: number, input: number): void;
    disconnect(destinationParam: AudioParam): void;
    disconnect(destinationParam: AudioParam, output: number): void;
  }

  interface PeriodicWave {}
  type OscillatorType = 'sine' | 'square' | 'sawtooth' | 'triangle';

  interface Window {
    AudioContext: {
      new(contextOptions?: AudioContextOptions): AudioContext;
      prototype: AudioContext;
    };
    webkitAudioContext: {
      new(contextOptions?: AudioContextOptions): AudioContext;
      prototype: AudioContext;
    };
  }
}

// Fallback for Node.js environment
declare const window: Window & typeof globalThis;

export class NotificationManager {
  private static instance: NotificationManager;
  private static readonly viewType = 'devTimeTracker.notification';

  private audioContext: AudioContext | null = null;
  private sounds: Map<SoundType, AudioBuffer> = new Map();
  private readonly soundPresets: Record<SoundType, SoundPreset> = {
    'alert': { duration: 0.5, type: 2, freq: 800, volume: 0.1, attack: 0.01, decay: 0.2, sustain: 0.3, release: 0.2 },
    'success': { duration: 0.3, type: 1, freq: 1000, volume: 0.1, attack: 0.01, decay: 0.2, sustain: 0.3, release: 0.2 },
    'error': { duration: 0.5, type: 2, freq: 400, volume: 0.1, attack: 0.01, decay: 0.2, sustain: 0.3, release: 0.3 },
    'default': { duration: 0.2, type: 1, freq: 600, volume: 0.1, attack: 0.01, decay: 0.1, sustain: 0.1, release: 0.1 },
    'none': { duration: 0, type: 0, freq: 0, volume: 0, attack: 0, decay: 0, sustain: 0, release: 0 }
  };
  
  // Webview panel for notifications
  private webviewPanel: vscode.WebviewPanel | null = null;

  private constructor() {
    this.initializeAudioContext();
  }

  private initializeAudioContext() {
    try {
      const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.audioContext = new AudioCtx();
      }
    } catch (error) {
      console.error('Error initializing audio context:', error);
    }
  }

  private async loadSound(type: SoundType, preset: SoundPreset): Promise<void> {
    if (!this.audioContext) return;

    try {
      const buffer = await this.generateBeepSound(preset);
      if (buffer) {
        this.sounds.set(type, buffer);
      }
    } catch (error) {
      console.error(`Error loading sound ${type}:`, error);
    }
  }

  private generateBeepSound(preset: SoundPreset): Promise<AudioBuffer> {
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
          } else if (t < attack + decay) {
            env = 1 - (1 - sustain) * ((t - attack) / decay);
          } else if (t > duration - release) {
            env = sustain * (1 - (t - (duration - release)) / release);
          } else {
            env = sustain;
          }
          
          // Generate waveform
          if (type === 1) { // Sine
            value = Math.sin(2 * Math.PI * freq * t);
          } else if (type === 2) { // Square
            value = Math.sign(Math.sin(2 * Math.PI * freq * t));
          } else if (type === 3) { // Sawtooth
            value = 2 * ((t * freq) % 1) - 1;
          } else { // Triangle
            value = 1 - 4 * Math.abs(Math.round(t * freq) - (t * freq));
          }
          
          data[i] = value * (volume ?? 0.5) * env;
        }
        
        resolve(buffer);
      } catch (error) {
        reject(error);
      }
    });
  }

  public static getInstance(): NotificationManager {
    if (!NotificationManager.instance) {
      NotificationManager.instance = new NotificationManager();
    }
    return NotificationManager.instance;
  }

  public showNotificationCard(options: {
    title: string;
    message: string;
    type?: 'info' | 'warning' | 'error' | 'success';
    actions?: { title: string; action: string; isPrimary?: boolean }[];
    timeout?: number;
    showProgress?: boolean;
    progressValue?: number;
    sound?: 'default' | 'alert' | 'success' | 'error' | 'none';
  }): Thenable<string | undefined> {
    const { title, message, type = 'info', actions = [], timeout } = options;
    
    // Create a webview panel for rich notifications
    if (!this.webviewPanel) {
      this.webviewPanel = vscode.window.createWebviewPanel(
        NotificationManager.viewType,
        title,
        { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
        { enableScripts: true, retainContextWhenHidden: true }
      );

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
    } else {
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
        </button>`
      )
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

  private async playSound(type: SoundType = 'default'): Promise<void> {
    if (type === 'none' || !this.audioContext) return;
    
    try {
      // Check if the sound is already loaded
      if (!this.sounds.has(type)) {
        const preset = this.soundPresets[type];
        if (preset) {
          await this.loadSound(type, preset);
        } else {
          console.warn(`No sound preset found for type: ${type}`);
          return;
        }
      }
      
      const buffer = this.sounds.get(type);
      if (!buffer) return;

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
    } catch (error) {
      console.error(`Error playing sound ${type}:`, error);
    }
  }

  private getIconForType(type: string): string {
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

  private getBorderColorForType(type: string): string {
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

  private getIconColorForType(type: string): string {
    return this.getBorderColorForType(type);
  }

  private getHeaderBgColorForType(type: string): string {
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

  public dispose() {
    if (this.webviewPanel) {
      this.webviewPanel.dispose();
      this.webviewPanel = null;
    }
  }
}
