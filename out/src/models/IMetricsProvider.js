"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DefaultMetricsProvider = void 0;
/**
 * Default implementation of IMetricsProvider that returns neutral/default values
 */
class DefaultMetricsProvider {
    getTypingStats() {
        return { speed: 0, accuracy: 100 };
    }
    getCurrentSessionDuration() {
        return 0;
    }
    getActiveDocumentLanguage() {
        return undefined;
    }
}
exports.DefaultMetricsProvider = DefaultMetricsProvider;
//# sourceMappingURL=IMetricsProvider.js.map