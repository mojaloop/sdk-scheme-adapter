

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

'use strict'

import { DefaultLogger } from "@mojaloop/logging-bc-client-lib";
import { ILogger } from "@mojaloop/logging-bc-public-types-lib";

import {
  DomainEvent,
  SDKOutboundBulkRequestReceivedDmEvt,
  IDomainEventData,
  IRedisBulkTransactionStateRepoOptions,
  RedisBulkTransactionStateRepo,
  PartyInfoCallbackProcessedDmEvt,
  KafkaCommandEventConsumer,
  CommandEvent,
  IKafkaEventConsumerOptions,
  BulkTransactionEntity,
  IPartyInfoCallbackProcessedDmEvtData
} from '@mojaloop/sdk-scheme-adapter-private-shared-lib'
import { KafkaDomainEventProducer, IKafkaEventProducerOptions, IPartyResult  } from '@mojaloop/sdk-scheme-adapter-private-shared-lib'
import { randomUUID } from "crypto";
import { SDKSchemeAdapter } from '@mojaloop/api-snippets';

const logger: ILogger = new DefaultLogger('bc', 'appName', 'appVersion'); //TODO: parameterize the names here
jest.setTimeout(15000);
const messageTimeout = 5000;

const domainEventProducerOptions: IKafkaEventProducerOptions = {
    brokerList: 'localhost:9092',
    clientId: 'test-integration_client_id',
    topic: 'topic-sdk-outbound-domain-events'
}
const producer = new KafkaDomainEventProducer(domainEventProducerOptions, logger)


// Setup for Kafka Consumer
const commandEventConsumerOptions: IKafkaEventConsumerOptions = {
  brokerList: 'localhost:9092',
  clientId: 'test-integration_client_id',
  topics: ['topic-sdk-outbound-command-events'],
  groupId: "command_events_consumer_group"
}

var commandEvents: Array<CommandEvent> = []
  const _messageHandler = async (message: CommandEvent): Promise<void>  => {
  console.log('Command Message: ', message);
  commandEvents.push(message);
}
const consumer = new KafkaCommandEventConsumer(_messageHandler.bind(this), commandEventConsumerOptions, logger)

// Setup for Redis access
const bulkTransactionEntityRepoOptions: IRedisBulkTransactionStateRepoOptions = {
  connStr: 'redis://localhost:6379'
}
const bulkTransactionEntityRepo = new RedisBulkTransactionStateRepo(bulkTransactionEntityRepoOptions, logger);


const sampleDomainEventData: IDomainEventData = {
  key: 'sample-key1',
  name: SDKOutboundBulkRequestReceivedDmEvt.name,
  content: {
    bulkHomeTransactionID: "string",
    bulkTransactionId: "b51ec534-ee48-4575-b6a9-ead2955b8069",
    options: {
      onlyValidateParty: true,
      autoAcceptParty: {
        enabled: false
      },
      autoAcceptQuote: {
        enabled: true,
        perTransferFeeLimits: [
          {
            currency: "AED",
            amount: "123.45"
          }
        ]
      },
      skipPartyLookup: true,
      synchronous: true,
      bulkExpiration: "2016-05-24T08:38:08.699-04:00"
    },
    from: {
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
      },
      merchantClassificationCode: "1234",
      name: "string",
      personalInfo: {
        complexName: {
          firstName: "Henrik",
          middleName: "Johannes",
          lastName: "Karlsson"
        },
        dateOfBirth: "1966-06-16"
      }
    },
    individualTransfers: [
      {
        homeTransactionId: "b51ec534-ee48-4575-b6a9-ead0001b0001",
        to: {
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
          },
          merchantClassificationCode: "1234",
          name: "string",
          personalInfo: {
            complexName: {
              firstName: "Henrik",
              middleName: "Johannes",
              lastName: "Karlsson"
            },
            dateOfBirth: "1966-06-16"
          }
        },
        reference: "string",
        amountType: "RECEIVE",
        currency: "AED",
        amount: "123.45",
        note: "Note sent to Payee.",
        quoteExtensions: {
          extension: [
            {
              key: "string",
              value: "string"
            }
          ]
        },
        transferExtensions: {
          extension: [
            {
              key: "string",
              value: "string"
            }
          ]
        },
        lastError: {
          httpStatusCode: 0,
          mojaloopError: {
            errorInformation: {
              errorCode: "5100",
              errorDescription: "string",
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
      {
        homeTransactionId: "b51ec534-ee48-4575-b6a9-ead0002b0002",
        to: {
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
          },
          merchantClassificationCode: "1234",
          name: "string",
          personalInfo: {
            complexName: {
              firstName: "Henrik",
              middleName: "Johannes",
              lastName: "Karlsson"
            },
            dateOfBirth: "1966-06-16"
          }
        },
        reference: "string",
        amountType: "RECEIVE",
        currency: "AED",
        amount: "123.45",
        note: "Note sent to Payee.",
        quoteExtensions: {
          extension: [
            {
              key: "string",
              value: "string"
            }
          ]
        },
        transferExtensions: {
          extension: [
            {
              key: "string",
              value: "string"
            }
          ]
        },
        lastError: {
          httpStatusCode: 0,
          mojaloopError: {
            errorInformation: {
              errorCode: "5100",
              errorDescription: "string",
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
      }
    ],
    extensions: {
      extension: [
        {
          key: "string",
          value: "string"
        }
      ]
    }
  },
  timestamp: Date.now(),
  headers: []
}

describe('First domain event', () => {

  beforeEach(async () => {
    commandEvents = [];
  });

  beforeAll(async () => {
    await producer.init();
    await consumer.init();
    await consumer.start();
    await bulkTransactionEntityRepo.init();
  });

  afterAll(async () => {
    await producer.destroy();
    await consumer.destroy();
    await bulkTransactionEntityRepo.destroy();
  });

  test('should publish a domain event', async () => {
    const domainEventObj = new DomainEvent(sampleDomainEventData);
    await producer.sendDomainEvent(domainEventObj);
    await new Promise(resolve => setTimeout(resolve, messageTimeout));
    await expect(true)
  })

  test("1. When inbound domain event PartyInfoCallbackProcessed is received \
        Then outbound event ProcessSDKOutboundBulkPartyInfoRequestComplete should be published \
        If party lookup on bulk transaction has finished", async () => {
    const bulkTransactionId = randomUUID();
    const bulkRequest: SDKSchemeAdapter.Outbound.V2_0_0.Types.bulkTransactionRequest = {
        bulkHomeTransactionID: "string",
        bulkTransactionId: bulkTransactionId,
        options: {
          onlyValidateParty: true,
          autoAcceptParty: {
            enabled: false
          },
          autoAcceptQuote: {
            enabled: true,
          },
          skipPartyLookup: true,
          synchronous: true,
          bulkExpiration: "2016-05-24T08:38:08.699-04:00"
        },
        from: {
          partyIdInfo: {
            partyIdType: "MSISDN",
            partyIdentifier: "16135551212",
            fspId: "string",
          },
        },
        individualTransfers: [
          {
            homeTransactionId: randomUUID(),
            to: {
              partyIdInfo: {
                partyIdType: "MSISDN",
                partyIdentifier: "16135551212",
              },
            },
            amountType: "SEND",
            currency: "USD",
            amount: "123.45",
          },
          {
            homeTransactionId: randomUUID(),
            to: {
              partyIdInfo: {
                partyIdType: "MSISDN",
                partyIdentifier: "16135551212",
              },
            },
            amountType: "SEND",
            currency: "USD",
            amount: "456.78",
          }
        ]
      }
    await bulkTransactionEntityRepo.store(BulkTransactionEntity.CreateFromRequest(bulkRequest).exportState());
    await bulkTransactionEntityRepo.setPartyLookupTotalCount(bulkTransactionId, 2);
    await bulkTransactionEntityRepo.incrementPartyLookupSuccessCount(bulkTransactionId, 2);
    await bulkTransactionEntityRepo.setPartyLookupFailedCount(bulkTransactionId, 0);

    const samplePartyInfoCallbackProcessedDmEvtData: IPartyInfoCallbackProcessedDmEvtData = {
      bulkId: bulkTransactionId,
      content: {
        transferId: randomUUID()
      },
      timestamp: Date.now(),
      headers: [],
    }
    const message = new PartyInfoCallbackProcessedDmEvt(samplePartyInfoCallbackProcessedDmEvtData);
    await producer.sendDomainEvent(message);
    await new Promise(resolve => setTimeout(resolve, messageTimeout));

    // Check command events published to kafka
    expect(commandEvents[0].getName()).toBe('ProcessSDKOutboundBulkPartyInfoRequestCompleteCmdEvt')
  })

  test("2. When inbound domain event PartyInfoCallbackProcessed is received \
       Then outbound event ProcessSDKOutboundBulkPartyInfoRequestComplete should not be published \
       If party lookup on bulk transaction has not finished", async () => {
        const bulkTransactionId = randomUUID();
        const bulkRequest: SDKSchemeAdapter.Outbound.V2_0_0.Types.bulkTransactionRequest = {
            bulkHomeTransactionID: "string",
            bulkTransactionId: bulkTransactionId,
            options: {
              onlyValidateParty: true,
              autoAcceptParty: {
                enabled: false
              },
              autoAcceptQuote: {
                enabled: true,
              },
              skipPartyLookup: true,
              synchronous: true,
              bulkExpiration: "2016-05-24T08:38:08.699-04:00"
            },
            from: {
              partyIdInfo: {
                partyIdType: "MSISDN",
                partyIdentifier: "16135551212",
                fspId: "string",
              },
            },
            individualTransfers: [
              {
                homeTransactionId: randomUUID(),
                to: {
                  partyIdInfo: {
                    partyIdType: "MSISDN",
                    partyIdentifier: "16135551212",
                  },
                },
                amountType: "SEND",
                currency: "USD",
                amount: "123.45",
              },
              {
                homeTransactionId: randomUUID(),
                to: {
                  partyIdInfo: {
                    partyIdType: "MSISDN",
                    partyIdentifier: "16135551212",
                  },
                },
                amountType: "SEND",
                currency: "USD",
                amount: "456.78",
              }
            ]
          }
        await bulkTransactionEntityRepo.store(bulkRequest);
        await bulkTransactionEntityRepo.setPartyLookupTotalCount(bulkTransactionId, 2);
        await bulkTransactionEntityRepo.incrementPartyLookupSuccessCount(bulkTransactionId, 1);
        await bulkTransactionEntityRepo.setPartyLookupFailedCount(bulkTransactionId, 0);

        const samplePartyInfoCallbackProcessedDmEvtData: IPartyInfoCallbackProcessedDmEvtData = {
          bulkId: bulkTransactionId,
          content: {
            transferId: randomUUID()
          },
          timestamp: Date.now(),
          headers: [],
        }
        const message = new PartyInfoCallbackProcessedDmEvt(samplePartyInfoCallbackProcessedDmEvtData);
        await producer.sendDomainEvent(message);
        await new Promise(resolve => setTimeout(resolve, messageTimeout));

        // Check command events published to kafka
        expect(commandEvents[0]).toBe(undefined)
  })
})
