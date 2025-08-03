"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionManager = void 0;
class SessionManager {
    static apiUrl;
    static apiToken;
    static sessionId;
    static ctx;
    constructor(apiUrl, apiToken, ctx) {
        SessionManager.apiUrl = apiUrl.replace(/\/+$/, '');
        SessionManager.apiToken = apiToken;
        SessionManager.ctx = ctx;
    }
    async startSession() {
        const res = await fetch(`${SessionManager.apiUrl}/api/sessions/start`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${SessionManager.apiToken}`
            }
        });
        const data = await res.json();
        const session_id = data.session_id;
        SessionManager.sessionId = session_id;
        SessionManager.ctx.globalState.update('sessionId', session_id);
        return session_id;
    }
    static async endSession() {
        if (!SessionManager.sessionId)
            return;
        await fetch(`${SessionManager.apiUrl}/api/sessions/end`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${SessionManager.apiToken}`
            },
            body: JSON.stringify({ session_id: SessionManager.sessionId })
        });
    }
}
exports.SessionManager = SessionManager;
//# sourceMappingURL=sessionManager.js.map