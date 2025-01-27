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

 --------------
 ******/
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
 * Infitx
 - Vijay Kumar Guthi <vijaya.guthi@infitx.com>
 --------------
 ******/

import * as ProcessSDKOutboundBulkRequestHandler from './process_sdk_outbound_bulk_request';
import * as ProcessSDKOutboundBulkPartyInfoRequestHandler from './process_sdk_outbound_bulk_party_info_request';
import * as ProcessPartyInfoCallbackHandler from './process_party_info_callback';
import * as ProcessSDKOutboundBulkAcceptPartyInfoHandler from './process_sdk_outbound_bulk_accept_party_info';
import * as ProcessBulkQuotesCallbackHandler from './process_bulk_quotes_callback';
import * as ProcessSDKOutboundBulkQuotesRequestHandler from './process_sdk_outbound_bulk_quotes_request';
import * as ProcessSDKOutboundBulkTransfersRequestHandler from './process_sdk_outbound_bulk_transfers_request';
import * as ProcessSDKOutboundBulkAcceptQuoteHandler from './process_sdk_outbound_bulk_accept_quote';
import * as ProcessBulkTransfersCallbackHandler from './process_bulk_transfers_callback';
import * as ProcessSDKOutboundBulkResponse from './prepare_sdk_outbound_bulk_response';
import * as ProcessSDKOutboundBulkResponseSent from './process_sdk_outbound_bulk_response_sent';

import { CommandEvent } from '@mojaloop/sdk-scheme-adapter-private-shared-lib';
import { ICommandEventHandlerOptions } from '@module-types';
import { ILogger } from '@mojaloop/logging-bc-public-types-lib';

export default  {
    ...ProcessSDKOutboundBulkRequestHandler,
    ...ProcessSDKOutboundBulkPartyInfoRequestHandler,
    ...ProcessPartyInfoCallbackHandler,
    ...ProcessSDKOutboundBulkAcceptPartyInfoHandler,
    ...ProcessBulkQuotesCallbackHandler,
    ...ProcessSDKOutboundBulkQuotesRequestHandler,
    ...ProcessSDKOutboundBulkAcceptQuoteHandler,
    ...ProcessSDKOutboundBulkTransfersRequestHandler,
    ...ProcessBulkTransfersCallbackHandler,
    ...ProcessSDKOutboundBulkResponse,
    ...ProcessSDKOutboundBulkResponseSent,
} as {
    [key: string]: (
        message: CommandEvent,
        options: ICommandEventHandlerOptions,
        logger: ILogger,
    ) => Promise<void>
};
