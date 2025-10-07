import { ActualBudgetConfig, ActualServerConfig, Config } from './config.js';

export type Scope = {
    servers?: Array<string>;
    budgets?: Array<string>;
    accounts?: Array<string>;
};

const matchesFilter = (candidates: Array<string | undefined>, filterValues?: Array<string>) => {
    if (!filterValues || filterValues.length === 0) {
        return true;
    }

    const normalizedFilter = filterValues.map(v => v.toLowerCase());
    return candidates.some(candidate =>
        candidate && normalizedFilter.includes(candidate.toLowerCase())
    );
};

export const applyScope = (config: Config, scope: Scope): Config => {
    const servers = config.actualServers
        .filter((server) => {
            // Simple server filtering by URL
            return matchesFilter([server.serverUrl], scope.servers);
        })
        .map((server) => {
            const budgets = server.budgets.filter((budget) => {
                // Simple budget filtering by syncId
                return matchesFilter([budget.syncId], scope.budgets);
            });

            if (budgets.length === 0) {
                return null;
            }

            return {
                ...server,
                budgets,
            };
        })
        .filter((server): server is ActualServerConfig => server !== null);

    return {
        ...config,
        actualServers: servers,
    };
};
