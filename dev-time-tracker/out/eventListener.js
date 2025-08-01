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
exports.EventListener = void 0;
const vscode = __importStar(require("vscode"));
class EventListener {
    ctx;
    buffer;
    sessionId;
    lastTime = Date.now();
    totalMs = 0;
    constructor(ctx, buffer, sessionId) {
        this.ctx = ctx;
        this.buffer = buffer;
        this.sessionId = sessionId;
    }
    start() {
        const record = (type) => {
            const now = Date.now();
            const delta = now - this.lastTime;
            if (delta < 5 * 60_000)
                this.totalMs += delta;
            this.lastTime = now;
            const evt = { sessionId: this.sessionId, eventType: type, timestamp: now };
            this.buffer.add(evt);
            this.ctx.globalState.update('activeMs', this.totalMs);
        };
        vscode.window.onDidChangeTextEditorSelection(() => record('typing'), this);
        vscode.workspace.onDidChangeTextDocument(() => record('typing'), this);
        vscode.window.onDidChangeTextEditorSelection(() => record('mousemove'), this);
    }
    getActiveMinutes() {
        return Math.floor(this.totalMs / 60_000);
    }
}
exports.EventListener = EventListener;
//# sourceMappingURL=eventListener.js.map