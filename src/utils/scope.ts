import { ActualBudgetConfig, ActualServerConfig, Config } from './config.js';

export type Scope = {
    servers?: Array<string>;
    budgets?: Array<string>;
    accounts?: Array<string>;
};

const toKey = (value: string) => value.toLowerCase();

type Matcher = ((value: string) => boolean) | null;

const createMatcher = (values?: Array<string>): Matcher => {
    if (!values || values.length === 0) {
        return null;
    }

    const normalized = new Set(values.map((value) => toKey(value)));
    return (value: string) => normalized.has(toKey(value));
};

const matches = (matcher: Matcher, candidates: Array<string | undefined>) => {
    if (!matcher) {
        return true;
    }

    return candidates.some((candidate) => candidate && matcher(candidate));
};

const resolveServerCandidates = (server: ActualServerConfig) => {
    const { serverUrl } = server;
    const name = (server as ActualServerConfig & { name?: string }).name;
    return [name, serverUrl];
};

const resolveBudgetCandidates = (budget: ActualBudgetConfig) => {
    const namedBudget = (budget as ActualBudgetConfig & { name?: string }).name;
    const budgetId = (budget as ActualBudgetConfig & { id?: string }).id;

    return [namedBudget, budgetId, budget.syncId];
};

const resolveAccountCandidates = (budget: ActualBudgetConfig) => {
    const accountMapping = budget.accountMapping || {};
    return Object.keys(accountMapping);
};

export const applyScope = (config: Config, scope: Scope): Config => {
    const wantServer = createMatcher(scope.servers);
    const wantBudget = createMatcher(scope.budgets);
    const wantAccount = createMatcher(scope.accounts);

    const servers = config.actualServers
        .filter((server) =>
            matches(wantServer, resolveServerCandidates(server))
        )
        .map((server) => {
            const budgets = server.budgets.filter((budget) => {
                // Filter by budget criteria
                const budgetMatches = matches(wantBudget, resolveBudgetCandidates(budget));

                // If no account filter is specified, include the budget
                if (!wantAccount) {
                    return budgetMatches;
                }

                // If account filter is specified, check if budget has matching accounts
                const accountMatches = matches(wantAccount, resolveAccountCandidates(budget));

                return budgetMatches && accountMatches;
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
