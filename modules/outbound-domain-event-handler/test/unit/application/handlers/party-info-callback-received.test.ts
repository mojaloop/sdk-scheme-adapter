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
 - Kevin Leyow <kevin.leyow@infitx.com>

 --------------
 ******/
'use strict'

import { DefaultLogger } from "@mojaloop/logging-bc-client-lib";
import { ILogger } from "@mojaloop/logging-bc-public-types-lib";
import {
  DomainEvent,
  EventType,
  IDomainEventData,
  IPartyInfoCallbackReceivedDmEvtData,
  PartyInfoCallbackReceivedDmEvt,
  ProcessPartyInfoCallbackCmdEvt,
} from "@mojaloop/sdk-scheme-adapter-private-shared-lib"
import { randomUUID } from "crypto";
import { handlePartyInfoCallbackReceived } from "../../../../src/application/handlers"
import { IDomainEventHandlerOptions } from "../../../../src/types";


describe('handlePartyInfoCallbackReceived', () => {
  const logger: ILogger = new DefaultLogger('bc', 'appName', 'appVersion');
  const domainEventHandlerOptions = {
    commandProducer: {
      init: jest.fn(),
      sendCommandEvent: jest.fn()
    }
  } as unknown as IDomainEventHandlerOptions

  let samplePartyInfoCallbackReceivedMessageData: IPartyInfoCallbackReceivedDmEvtData;
  let bulkId: string = randomUUID();

  beforeEach(async () => {
    samplePartyInfoCallbackReceivedMessageData = {
      bulkId,
      content: {
        transferId: randomUUID(),
        partyResult: {
          currentState: "COMPLETED",
          party: {
            partyIdInfo: {
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
          }
        }
      },
      timestamp: Date.now(),
      headers: [],
    }
  });


  test('emits a processPartyInfoCallbackMessage message', async () => {
    const sampleDomainEventDataObj = new PartyInfoCallbackReceivedDmEvt(samplePartyInfoCallbackReceivedMessageData);
    handlePartyInfoCallbackReceived(sampleDomainEventDataObj, domainEventHandlerOptions, logger)
    expect(domainEventHandlerOptions.commandProducer.sendCommandEvent)
      .toHaveBeenCalledWith(
        expect.objectContaining({
          _data: expect.objectContaining({
            key:bulkId,
            name: ProcessPartyInfoCallbackCmdEvt.name,
            type: EventType.COMMAND_EVENT
          })
        })
    )
  })
})
