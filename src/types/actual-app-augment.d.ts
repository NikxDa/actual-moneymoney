import type { ImportTransactionEntity } from '@actual-app/api/@types/loot-core/src/types/models/import-transaction';

declare module '@actual-app/api' {
    export type CreateTransaction = ImportTransactionEntity;
}
