export interface ConfigDefaultDecision {
    path: string;
    value: unknown;
    hints?: readonly string[];
}

export interface ConfigDecisionLogEntry {
    message: string;
    hints: string[];
}

export interface ConfigDecisionLogOptions {
    maxHints?: number;
    redactor?: (path: string, value: unknown) => string;
}

const clampToNonNegativeInteger = (value: unknown): number => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return 0;
    }

    return Math.max(0, Math.floor(numeric));
};

const formatDefaultValue = (value: unknown): string => {
    try {
        if (typeof value === 'string') {
            return JSON.stringify(value);
        }

        const seen = new Set<unknown>();
        const json = JSON.stringify(value, (_, currentValue) => {
            if (typeof currentValue === 'object' && currentValue !== null) {
                if (seen.has(currentValue)) {
                    return '[Circular]';
                }
                seen.add(currentValue);
            }

            return currentValue;
        });

        if (typeof json === 'string') {
            return json;
        }

        return String(value);
    } catch {
        try {
            return JSON.stringify(String(value));
        } catch {
            return String(value);
        }
    }
};

const normaliseHints = (hints?: readonly string[]): string[] => {
    if (hints === undefined) {
        return [];
    }

    const lines: string[] = [];
    for (const hint of hints) {
        const source = String(hint);
        for (const rawLine of source.split('\n')) {
            const trimmed = rawLine.trim();
            if (trimmed.length > 0) {
                lines.push(trimmed);
            }
        }
    }

    return lines;
};

const normalisePath = (pathValue: unknown): string => {
    if (typeof pathValue === 'string') {
        return pathValue;
    }

    return String(pathValue ?? '<unknown>');
};

export const DEFAULT_DECISION_LOG_MAX_HINTS = 200;
export const MAX_HINTS_HARD_CAP = Number.MAX_SAFE_INTEGER;

export const createDefaultDecisionLog = (
    decisions: readonly ConfigDefaultDecision[],
    options: ConfigDecisionLogOptions = {}
): ConfigDecisionLogEntry | null => {
    if (!Array.isArray(decisions) || decisions.length === 0) {
        return null;
    }

    const normalisedDecisions = decisions.map((decision) => {
        let safeValue = decision.value;
        if (options.redactor !== undefined) {
            try {
                safeValue = options.redactor(decision.path, decision.value);
            } catch {
                safeValue = '[REDACTED]';
            }
        }

        return {
            path: normalisePath(decision.path),
            value: formatDefaultValue(safeValue),
            hints: normaliseHints(decision.hints),
        };
    });

    if (normalisedDecisions.length === 1) {
        const decision = normalisedDecisions[0]!;

        return {
            message: 'Using default configuration value.',
            hints: [
                `Path: ${decision.path}`,
                `Value: ${decision.value}`,
                ...decision.hints.map((hint) => `  ${hint}`),
            ],
        };
    }

    const provided = options.maxHints;
    const maxHints =
        provided === Infinity
            ? MAX_HINTS_HARD_CAP
            : clampToNonNegativeInteger(
                  provided ?? DEFAULT_DECISION_LOG_MAX_HINTS
              );
    const aggregatedHints: string[] = [];
    let appended = 0;
    let omitted = 0;

    for (const decision of normalisedDecisions) {
        const decisionLines = [
            `Path: ${decision.path}`,
            `Value: ${decision.value}`,
            ...decision.hints.map((hint) => `  ${hint}`),
        ];

        for (const line of decisionLines) {
            if (appended < maxHints) {
                aggregatedHints.push(line);
                appended += 1;
            } else {
                omitted += 1;
            }
        }
    }

    if (omitted > 0) {
        aggregatedHints.push(`…${omitted} more hint lines omitted`);
    }

    return {
        message: `Using default configuration values for ${normalisedDecisions.length} entries.`,
        hints: aggregatedHints,
    };
};
