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
 - Kevin Leyow <kevin.leyow@modusbox.com>

 --------------
 ******/

'use strict'

import { DefaultLogger } from "@mojaloop/logging-bc-client-lib";
import { ILogger } from "@mojaloop/logging-bc-public-types-lib";
import {
  IPartyInfoCallbackReceivedMessageData,
  PartyInfoCallbackReceivedMessage,
} from "@mojaloop/sdk-scheme-adapter-private-shared-lib"
import { randomUUID } from "crypto";

describe('PartyInfoCallbackReceivedMessage', () => {
  const logger: ILogger = new DefaultLogger('bc', 'appName', 'appVersion');

  let samplePartyInfoCallbackReceivedMessageData: IPartyInfoCallbackReceivedMessageData;
  let key: string;
  let partyInfoCallbackReceivedMessage: PartyInfoCallbackReceivedMessage;
  let bulkId: string;
  let transferId: string;

  beforeEach(async () => {
    bulkId = randomUUID()
    transferId = randomUUID()
    key = `${bulkId}_${transferId}`
    samplePartyInfoCallbackReceivedMessageData = {
      key,
      partyResult: {
        partyId: {
          partyIdType: "MSISDN",
          partyIdentifier: "16135551212",
          partySubIdOrType: "string",
          fspId: "string",
          extensionList: {
            extension: [
              {
                key: "string",
                value: "string"
              }
            ]
          }
        }
      },
      timestamp: Date.now(),
      headers: [],
    }
    partyInfoCallbackReceivedMessage = new PartyInfoCallbackReceivedMessage(samplePartyInfoCallbackReceivedMessageData)
  })

  test('getBulkId', async () => {
    expect(partyInfoCallbackReceivedMessage.getBulkId()).toEqual(bulkId)
  })

  test('getTransferId', async () => {
    expect(partyInfoCallbackReceivedMessage.getTransferId()).toEqual(transferId)
  })

  test('getPartyResult', async () => {
    expect(partyInfoCallbackReceivedMessage.getPartyResult()).toEqual({
      partyId: {
        partyIdType: "MSISDN",
        partyIdentifier: "16135551212",
        partySubIdOrType: "string",
        fspId: "string",
        extensionList: {
          extension: [
            {
              key: "string",
              value: "string"
            }
          ]
        }
      }
    })
  })
})
