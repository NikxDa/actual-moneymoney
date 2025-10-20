import { ActualServerConfig, Config } from './config.js';

export type Scope = {
    servers?: Array<string>;
    budgets?: Array<string>;
    accounts?: Array<string>;
};

const matchesFilter = (
    candidates: Array<string | undefined>,
    filterValues?: Array<string>
) => {
    if (!filterValues || filterValues.length === 0) {
        return true;
    }

    const normalizedFilter = filterValues
        .filter((v) => v.trim().length > 0)
        .map((v) => v.toLowerCase());
    return candidates.some(
        (candidate) =>
            candidate &&
            candidate.trim().length > 0 &&
            normalizedFilter.includes(candidate.toLowerCase())
    );
};

export const applyScope = (config: Config, scope: Scope): Config => {
    const servers = config.actualServers
        .filter((server) => {
            // Simple server filtering by URL
            return matchesFilter([server.serverUrl], scope.servers);
        })
        .map((server) => {
            const budgets = server.budgets
                .filter((budget) => {
                    // Simple budget filtering by syncId
                    return matchesFilter([budget.syncId], scope.budgets);
                })
                .map((budget) => {
                    // Apply account filtering if scope.accounts is provided
                    if (!scope.accounts || scope.accounts.length === 0) {
                        return budget;
                    }

                    const filteredAccountMapping: Record<string, string> = {};
                    for (const [monMonRef, actualAccount] of Object.entries(
                        budget.accountMapping
                    )) {
                        // Check if either the MoneyMoney reference or Actual account name matches the filter
                        if (
                            matchesFilter(
                                [monMonRef, actualAccount],
                                scope.accounts
                            )
                        ) {
                            filteredAccountMapping[monMonRef] = actualAccount;
                        }
                    }

                    return {
                        ...budget,
                        accountMapping: filteredAccountMapping,
                    };
                })
                .filter((budget) => {
                    // Remove budgets with empty account mappings
                    return Object.keys(budget.accountMapping).length > 0;
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
