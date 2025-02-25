/*****
 License
 --------------
 Copyright © 2020-2025 Mojaloop Foundation
 The Mojaloop files are made available by the Mojaloop Foundation under the Apache License, Version 2.0 (the "License") and you may not use these files except in compliance with the License. You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, the Mojaloop files are distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.

 Contributors
 --------------
 This is the official list of the Mojaloop project contributors for this file.
 Names of the original copyright holders (individuals or organizations)
 should be listed with a '*' in the first column. People who have
 contributed from an organization can be listed under the organization
 that actually holds the copyright for their contributions (see the
 Mojaloop Foundation for an example). Those individuals should have
 their names indented and be marked with a '-'. Email address can be added
 optionally within square brackets <email>.

 * Mojaloop Foundation
 - Name Surname <name.surname@mojaloop.io>
 * Infitx
 - Vijay Kumar Guthi <vijaya.guthi@infitx.com>
 --------------
 ******/

import { BulkTransaction } from '../models';
import { ILogger } from '@mojaloop/logging-bc-public-types-lib';
import { RedisBulkTransactionStateRepo } from '@mojaloop/sdk-scheme-adapter-private-shared-lib';
export class BulkTransactionsService {

    private _repo: RedisBulkTransactionStateRepo;

    constructor(repo: RedisBulkTransactionStateRepo, logger: ILogger) {
        this._repo = repo;
    }

    // Get the bulkTransactions
    public async getAll(id?: string): Promise<Array<BulkTransaction>> {
        const bulkTransactions: Array<BulkTransaction> = [];
        const allBulkIds = await this._repo.getAllBulkIds();
        for(const bulkId of allBulkIds) {
            const bulkState = await this._repo.load(bulkId);
            const individualTransfers = [];
            const allIndividualTransferIds = await this._repo.getAllIndividualTransferIds(bulkId);
            for(const individualTransferId of allIndividualTransferIds) {
                const individualTransferState = await this._repo.getIndividualTransfer(bulkId, individualTransferId);
                individualTransfers.push({
                    id: individualTransferId,
                    state: individualTransferState.state,
                });
            }
            bulkTransactions.push({
                id: bulkState.id,
                state: bulkState.state,
                individualTransfers,
            });
        }
        return bulkTransactions;
    }

}
