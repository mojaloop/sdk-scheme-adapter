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
  EventType,
  IPartyInfoCallbackProcessedDmEvtData,
  PartyInfoCallbackProcessedDmEvt,
  ProcessSDKOutboundBulkPartyInfoRequestCompleteCmdEvt,
} from "@mojaloop/sdk-scheme-adapter-private-shared-lib"
import { randomUUID } from "crypto";
import { handlePartyInfoCallbackProcessed } from "../../../../src/application/handlers"
import { IDomainEventHandlerOptions } from "../../../../src/types";


describe('handlePartyInfoCallbackProcessed', () => {
  const logger: ILogger = new DefaultLogger('bc', 'appName', 'appVersion');
  const domainEventHandlerOptions = {
    commandProducer: {
      init: jest.fn(),
      sendCommandEvent: jest.fn()
    },
    bulkTransactionEntityRepo: {
      getPartyLookupTotalCount: jest.fn(),
      getPartyLookupSuccessCount: jest.fn(),
      getPartyLookupFailedCount: jest.fn(),
    }
  } as unknown as IDomainEventHandlerOptions

  let samplePartyInfoCallbackProcessedDmEvtData: IPartyInfoCallbackProcessedDmEvtData;
  let key: string;

  beforeEach(async () => {
    key = randomUUID();
    samplePartyInfoCallbackProcessedDmEvtData = {
      bulkId: key,
      content: {
        transferId: randomUUID()
      },
      timestamp: Date.now(),
      headers: [],
    }
  });


  test('emits a processSDKOutboundBulkPartyInfoRequestComplete message when lookup is complete', async () => {
    domainEventHandlerOptions.bulkTransactionEntityRepo.getPartyLookupTotalCount.mockReturnValueOnce(10);
    domainEventHandlerOptions.bulkTransactionEntityRepo.getPartyLookupSuccessCount.mockReturnValueOnce(5);
    domainEventHandlerOptions.bulkTransactionEntityRepo.getPartyLookupFailedCount.mockReturnValueOnce(5);


    const sampleDomainEventDataObj = new PartyInfoCallbackProcessedDmEvt(samplePartyInfoCallbackProcessedDmEvtData);
    await handlePartyInfoCallbackProcessed(sampleDomainEventDataObj, domainEventHandlerOptions, logger);
    expect(domainEventHandlerOptions.bulkTransactionEntityRepo.getPartyLookupTotalCount).toBeCalledWith(key);
    expect(domainEventHandlerOptions.bulkTransactionEntityRepo.getPartyLookupSuccessCount).toBeCalledWith(key);
    expect(domainEventHandlerOptions.bulkTransactionEntityRepo.getPartyLookupFailedCount).toBeCalledWith(key);
    expect(domainEventHandlerOptions.commandProducer.sendCommandEvent)
      .toBeCalledWith(
        expect.objectContaining({
          _data: expect.objectContaining({
            key,
            name: ProcessSDKOutboundBulkPartyInfoRequestCompleteCmdEvt.name,
            type: EventType.COMMAND_EVENT
          })
        })
      )
  })

  test('emits no message when lookup is incomplete', async () => {
    domainEventHandlerOptions.bulkTransactionEntityRepo.getPartyLookupTotalCount.mockReturnValueOnce(10);
    domainEventHandlerOptions.bulkTransactionEntityRepo.getPartyLookupSuccessCount.mockReturnValueOnce(4);
    domainEventHandlerOptions.bulkTransactionEntityRepo.getPartyLookupFailedCount.mockReturnValueOnce(5);


    const sampleDomainEventDataObj = new PartyInfoCallbackProcessedDmEvt(samplePartyInfoCallbackProcessedDmEvtData);
    await handlePartyInfoCallbackProcessed(sampleDomainEventDataObj, domainEventHandlerOptions, logger);
    expect(domainEventHandlerOptions.bulkTransactionEntityRepo.getPartyLookupTotalCount).toBeCalledWith(key);
    expect(domainEventHandlerOptions.bulkTransactionEntityRepo.getPartyLookupSuccessCount).toBeCalledWith(key);
    expect(domainEventHandlerOptions.bulkTransactionEntityRepo.getPartyLookupFailedCount).toBeCalledWith(key);
    expect(domainEventHandlerOptions.commandProducer.sendCommandEvent)
      .toBeCalledTimes(0)
  })
})