import type { CreateTransaction as LocalCreateTransaction } from './actual-app__api.js';

declare module '@actual-app/api' {
    export type CreateTransaction = LocalCreateTransaction;
}
