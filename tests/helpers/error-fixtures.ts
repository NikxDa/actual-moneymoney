type ErrorOverrides = Record<string, unknown>;

const withCause = (error: Error, cause?: unknown) => {
    if (!cause) {
        return error;
    }

    try {
        return new (Error as ErrorConstructor & {
            new (message?: string, options?: { cause?: unknown }): Error;
        })(error.message, { cause });
    } catch {
        (error as Error & { cause?: unknown }).cause = cause;
        return error;
    }
};

export const makeNetworkDisconnectError = (overrides: ErrorOverrides = {}) => {
    const base = Object.assign(
        new Error('request to Actual server failed: connect ECONNREFUSED'),
        { code: 'ECONNREFUSED' },
        overrides
    );

    if ('cause' in overrides) {
        return base;
    }

    const cause = Object.assign(new Error('connect ECONNREFUSED'), {
        code: 'ECONNREFUSED',
    });

    return Object.assign(withCause(base, cause), overrides);
};

export const makeInvalidCredentialsError = (overrides: ErrorOverrides = {}) =>
    Object.assign(new Error('Failed to login: Invalid password provided'), overrides);

export type ErrorFixture =
    | ReturnType<typeof makeNetworkDisconnectError>
    | ReturnType<typeof makeInvalidCredentialsError>;
