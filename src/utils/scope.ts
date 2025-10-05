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


export const applyScope = (config: Config, scope: Scope): Config => {
    const wantServer = createMatcher(scope.servers);
    const wantBudget = createMatcher(scope.budgets);

    const servers = config.actualServers
        .filter((server) =>
            matches(wantServer, resolveServerCandidates(server))
        )
        .map((server) => {
            const budgets = server.budgets.filter((budget) => {
                // Filter by budget criteria only
                // Account filtering is handled later by the Importer class
                return matches(
                    wantBudget,
                    resolveBudgetCandidates(budget)
                );
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
