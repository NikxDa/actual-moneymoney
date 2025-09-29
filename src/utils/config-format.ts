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
}

const formatDefaultValue = (value: unknown): string => {
    if (typeof value === 'string') {
        return value;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }

    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
};

const normaliseHints = (hints?: readonly string[]): string[] => {
    if (!hints) {
        return [];
    }

    return hints.map((hint) => String(hint));
};

const normalisePath = (pathValue: unknown): string => {
    if (typeof pathValue === 'string') {
        return pathValue;
    }

    return String(pathValue ?? '<unknown>');
};

export const DEFAULT_DECISION_LOG_MAX_HINTS = 200;

export const createDefaultDecisionLog = (
    decisions: readonly ConfigDefaultDecision[],
    options: ConfigDecisionLogOptions = {}
): ConfigDecisionLogEntry | null => {
    if (!Array.isArray(decisions) || decisions.length === 0) {
        return null;
    }

    const normalisedDecisions = decisions.map((decision) => ({
        path: normalisePath(decision.path),
        value: formatDefaultValue(decision.value),
        hints: normaliseHints(decision.hints),
    }));

    if (normalisedDecisions.length === 1) {
        const decision = normalisedDecisions[0];
        if (!decision) {
            return null;
        }

        return {
            message: 'Using default configuration value.',
            hints: [
                `Path: ${decision.path}`,
                `Value: ${decision.value}`,
                ...decision.hints,
            ],
        };
    }

    const maxHints = options.maxHints ?? Infinity;
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
