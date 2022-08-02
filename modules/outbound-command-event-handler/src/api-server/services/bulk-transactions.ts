/*****
 License
 --------------
 Copyright © 2017 Bill & Melinda Gates Foundation
 The Mojaloop files are made available by the Bill & Melinda Gates Foundation under the Apache License, Version 2.0 (the "License") and you may not use these files except in compliance with the License. You may obtain a copy of the License at
 http://www.apache.org/licenses/LICENSE-2.0
 Unless required by applicable law or agreed to in writing, the Mojaloop files are distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 Contributors
 --------------
 This is the official list (alphabetical ordering) of the Mojaloop project contributors for this file.
 Names of the original copyright holders (individuals or organizations)
 should be listed with a '*' in the first column. People who have
 contributed from an organization can be listed under the organization
 that actually holds the copyright for their contributions (see the
 Gates Foundation organization for an example). Those individuals should have
 their names indented and be marked with a '-'. Email address can be added
 optionally within square brackets <email>.
 * Gates Foundation
 - Name Surname <name.surname@gatesfoundation.com>
 * Modusbox
 - Vijay Kumar Guthi <vijaya.guthi@modusbox.com>
 --------------
 ******/

import { BulkTransaction } from '../models';
import { ILogger } from '@mojaloop/logging-bc-public-types-lib';
import { DefaultLogger } from '@mojaloop/logging-bc-client-lib';
import { IRedisBulkTransactionStateRepoOptions, RedisBulkTransactionStateRepo } from '../../infrastructure/redis_bulk_transaction_repo';
import Config from '../../shared/config';

// Start API server
const logger: ILogger = new DefaultLogger('bc', 'appName', 'appVersion'); // TODO: parameterize the names here

export class BulkTransactionsService {

    // Get the bulkTransactions
    public async getAll(id?: string): Promise<Array<BulkTransaction>> {
        const bulkTransactions: Array<BulkTransaction> = [];
        // TODO: Pass the repo object from index file instead of re-initializing here
        // Create bulk transaction entity repo
        const bulkTransactionEntityRepoOptions: IRedisBulkTransactionStateRepoOptions = {
            connStr: Config.get('REDIS.CONNECTION_URL')
        }
        const repo = new RedisBulkTransactionStateRepo(bulkTransactionEntityRepoOptions, logger);
        await repo.init();
        const allBulkIds = await repo.getAllIds();
        for(const bulkId of allBulkIds) {
            const bulkState = await repo.load(bulkId);
            const individualTransfers = [];
            const allAttributes = await repo.getAllAttributes(bulkId);
            const allIndividualTransferIds = allAttributes.filter(attr => attr.startsWith('individualItem_')).map(attr => attr.replace('individualItem_', ''))
            for(const individualTransferId of allIndividualTransferIds) {
                const individualTransferState = await repo.getAttribute(bulkId, 'individualItem_' + individualTransferId);
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
        await repo.destroy();
        return bulkTransactions;
    }

}