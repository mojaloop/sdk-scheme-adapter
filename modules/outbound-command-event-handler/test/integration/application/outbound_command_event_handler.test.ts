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
 - Sridevi Miriyala <sridevi.miriyala@modusbox.com
 --------------
 ******/

"use strict";

import { DefaultLogger } from "@mojaloop/logging-bc-client-lib";
import { ILogger } from "@mojaloop/logging-bc-public-types-lib";

import { CommandEventMessage, OutboundCommandEventMessageName, ICommandEventMessageData, DomainEventMessage,
         KafkaCommandEventProducer, IKafkaEventProducerOptions, KafkaDomainEventConsumer, IKafkaEventConsumerOptions, 
         IProcessSDKOutboundBulkPartyInfoRequestCompleteMessageData } from '@mojaloop/sdk-scheme-adapter-private-shared-lib'
import { SDKOutboundBulkRequestState } from '@mojaloop/sdk-scheme-adapter-public-shared-lib'
import { randomUUID } from "crypto";
import { RedisBulkTransactionStateRepo, IRedisBulkTransactionStateRepoOptions } from '../../../src/infrastructure/redis_bulk_transaction_repo'
 
const logger: ILogger = new DefaultLogger('bc', 'appName', 'appVersion'); //TODO: parameterize the names here

// Setup for Kafka Producer
const commandEventProducerOptions: IKafkaEventProducerOptions = {
    brokerList: 'localhost:9092',
    clientId: 'test-integration_client_id',
    topic: 'topic-sdk-outbound-command-events'
}
const producer = new KafkaCommandEventProducer(commandEventProducerOptions, logger)

// Setup for Kafka Consumer
const domainEventConsumerOptions: IKafkaEventConsumerOptions = {
  brokerList: 'localhost:9092',
  clientId: 'test-integration_client_id',
  topics: ['topic-sdk-outbound-domain-events'],
  groupId: "domain_events_consumer_client_id"
}
var domainEvents: Array<DomainEventMessage> = []
const _messageHandler = async (message: DomainEventMessage): Promise<void>  => {
  console.log('Domain Message: ', message);
  domainEvents.push(message);
}
const consumer = new KafkaDomainEventConsumer(_messageHandler.bind(this), domainEventConsumerOptions, logger)

// Setup for Redis access
const bulkTransactionEntityRepoOptions: IRedisBulkTransactionStateRepoOptions = {
  connStr: 'redis://localhost:6379'
}
const bulkTransactionEntityRepo = new RedisBulkTransactionStateRepo(bulkTransactionEntityRepoOptions, logger);


describe("Tests for Outbound Command Event Handler", () => {

  beforeEach(async () => {
    await producer.init();
    domainEvents = [];
    await consumer.init();
    await consumer.start();
    await bulkTransactionEntityRepo.init();
  });

  afterEach(async () => {
    await producer.destroy();
    await consumer.destroy();
    await bulkTransactionEntityRepo.destroy();
  });

  // TESTS FOR PARTY LOOKUP

  test("1. When inbound command event ProcessSDKOutboundBulkRequest is received \
        Then outbound event SDKOutboundBulkPartyInfoRequested should be published \
          And Global state should be updated to RECEIVED.", async () => {

    const bulkTransactionId = randomUUID();
    const content: SDKOutboundBulkRequestState = {
      request: {
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
      },
      created_at: Date.now(),
      updated_at: Date.now(),
      version: 1,
      id: bulkTransactionId
    }
    const sampleCommandEventMessageData: ICommandEventMessageData = {
      key: 'sample-key1',
      name: OutboundCommandEventMessageName.ProcessSDKOutboundBulkRequest,
      content,
      timestamp: Date.now(),
      headers: []
    }
    const commandEventObj = new CommandEventMessage(sampleCommandEventMessageData);
    await producer.sendCommandMessage(commandEventObj);
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    // Check the state in Redis
    console.log('bulk id: ', bulkTransactionId);
    const bulkState = await bulkTransactionEntityRepo.load(bulkTransactionId);
    expect(bulkState.state).toBe('RECEIVED');

    //Check that the state of individual transfers in bulk to be RECEIVED
    const individualTransfers = (await bulkTransactionEntityRepo.getAllAttributes(bulkTransactionId)).filter((key) => key.includes('individualItem_'))
    expect(individualTransfers.length).toBe(2);
    expect((await bulkTransactionEntityRepo.getAttribute(bulkTransactionId, individualTransfers[0])).state).toBe('RECEIVED');
    expect((await bulkTransactionEntityRepo.getAttribute(bulkTransactionId, individualTransfers[1])).state).toBe('RECEIVED');

    // Check domain events published to kafka
    expect(domainEvents[0].getName()).toBe('SDKOutboundBulkPartyInfoRequested')
    //TODO Add asserts to check data contents of the domain event published to kafka

  });

  test("2. Given Party info does not already exist for none of the individual transfers. \
          And Party Lookup is not skipped \
        When inbound command event ProcessSDKOutboundBulkPartyInfoRequest is received\
        Then the global state should be updated to DISCOVERY_PROCESSING \
          And PartyInfoRequested kafka event should be published for each individual transfer. \
          And State for individual transfer should be updated to DISCOVERY_PROCESSING.", async () => {

    //Publish this message so that it is stored internally in redis
    const bulkTransactionId = randomUUID();
    const initialBulkRequestState: SDKOutboundBulkRequestState = {
      request: {
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
          skipPartyLookup: false,
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
                partyIdentifier: "16135551212"
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
                partyIdentifier: "16135551213"
              },
            },
            amountType: "SEND",
            currency: "USD",
            amount: "456.78",
          }
        ]
      },
      created_at: Date.now(),
      updated_at: Date.now(),
      version: 1,
      id: bulkTransactionId
    }
    const initialBulkRequest: ICommandEventMessageData = {
      key: 'sample-key1',
      name: OutboundCommandEventMessageName.ProcessSDKOutboundBulkRequest,
      content: initialBulkRequestState,
      timestamp: Date.now(),
      headers: []
    }
    const initialBulkRequestCommandEventObj = new CommandEventMessage(initialBulkRequest);
    await producer.sendCommandMessage(initialBulkRequestCommandEventObj);
    await new Promise(resolve => setTimeout(resolve, 1000));

    const bulkPartyInfoRequestCommandEventMessageData: ICommandEventMessageData = {
      key: bulkTransactionId,
      name: OutboundCommandEventMessageName.ProcessSDKOutboundBulkPartyInfoRequest,
      content: null,
      timestamp: Date.now(),
      headers: []
    }
    const bulkPartyInfoRequestCommandEventObj = new CommandEventMessage(bulkPartyInfoRequestCommandEventMessageData);
    await producer.sendCommandMessage(bulkPartyInfoRequestCommandEventObj);
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    // Check the state in Redis
    console.log('bulk id: ', bulkTransactionId);
    const bulkState = await bulkTransactionEntityRepo.load(bulkTransactionId);
    expect(bulkState.state).toBe('DISCOVERY_PROCESSING');

    //Check that the state of individual transfers in bulk to be RECEIVED
    const individualTransfers = (await bulkTransactionEntityRepo.getAllAttributes(bulkTransactionId)).filter((key) => key.includes('individualItem_'))
    expect(individualTransfers.length).toBe(2);
    expect((await bulkTransactionEntityRepo.getAttribute(bulkTransactionId, individualTransfers[0])).state).toBe('DISCOVERY_PROCESSING');
    expect((await bulkTransactionEntityRepo.getAttribute(bulkTransactionId, individualTransfers[1])).state).toBe('DISCOVERY_PROCESSING');

    // Check domain events published to kafka
    expect(domainEvents.length).toBe(2);
    // Check the data contents for domain event
    expect(domainEvents[0].getName()).toBe('PartyInfoRequested');
    expect(JSON.parse(JSON.stringify(domainEvents[0].getContent())).path).not.toContain('undefined');
    expect(domainEvents[1].getName()).toBe('PartyInfoRequested');
    expect(JSON.parse(JSON.stringify(domainEvents[1].getContent())).path).not.toContain('undefined');
    

  });

  test("3. Given Party info exists for individual transfers. \
              And Party Lookup is not skipped \
            When inbound command event ProcessSDKOutboundBulkPartyInfoRequest is received \
            Then the global state should be updated to DISCOVERY_PROCESSING. \
              And PartyInfoRequested outbound event should not be published for each individual transfer. \
              And State for individual transfer should be updated to DISCOVERY_SUCCESS.", async () => {
    
    //Publish this message so that it is stored internally in redis
    const bulkTransactionId = randomUUID();
    const initialBulkRequestState: SDKOutboundBulkRequestState = {
      request: {
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
          skipPartyLookup: false,
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
                partyIdentifier: "16135551212"
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
                fspId: "receiverfsp"
              },
            },
            amountType: "SEND",
            currency: "USD",
            amount: "456.78",
          }
        ]
      },
      created_at: Date.now(),
      updated_at: Date.now(),
      version: 1,
      id: bulkTransactionId
    }
    const initialBulkRequest: ICommandEventMessageData = {
      key: 'sample-key1',
      name: OutboundCommandEventMessageName.ProcessSDKOutboundBulkRequest,
      content: initialBulkRequestState,
      timestamp: Date.now(),
      headers: []
    }
    const initialBulkRequestCommandEventObj = new CommandEventMessage(initialBulkRequest);
    await producer.sendCommandMessage(initialBulkRequestCommandEventObj);
    await new Promise(resolve => setTimeout(resolve, 1000));

    const bulkPartyInfoRequestCommandEventMessageData: ICommandEventMessageData = {
      key: bulkTransactionId,
      name: OutboundCommandEventMessageName.ProcessSDKOutboundBulkPartyInfoRequest,
      content: null,
      timestamp: Date.now(),
      headers: []
    }
    const bulkPartyInfoRequestCommandEventObj = new CommandEventMessage(bulkPartyInfoRequestCommandEventMessageData);
    await producer.sendCommandMessage(bulkPartyInfoRequestCommandEventObj);
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    // Check the state in Redis
    console.log('bulk id: ', bulkTransactionId);
    const bulkState = await bulkTransactionEntityRepo.load(bulkTransactionId);
    expect(bulkState.state).toBe('DISCOVERY_PROCESSING');

    //Check that the state of individual transfers in bulk to be RECEIVED
    const individualTransfers = (await bulkTransactionEntityRepo.getAllAttributes(bulkTransactionId)).filter((key) => key.includes('individualItem_'))
    expect(individualTransfers.length).toBe(2);
    // expect((await bulkTransactionEntityRepo.getAttribute(bulkTransactionId, individualTransfers[0])).state).toBe('DISCOVERY_SUCCESS');
    // expect((await bulkTransactionEntityRepo.getAttribute(bulkTransactionId, individualTransfers[1])).state).toBe('DISCOVERY_SUCCESS');

    // Check domain events published to kafka
    expect(domainEvents.length).toBe(0)
    //TODO Add asserts to check data contents of the domain event published to kafka
  });

  test.only("4. Given receiving party info does not exist \
              And receiving party lookup was successful \
            When inbound command event ProcessPartyInfoCallback is received \
            Then the state for individual successful party lookups should be updated to DISCOVERY_SUCCESS \
              And the data in redis for individual transfer should be updated with received party info \
              And outbound event PartyInfoCallbackProcessed event should be published", async () => {
    
    //Publish this message so that it is stored internally in redis
    const bulkTransactionId = randomUUID();
    const initialBulkRequestState: SDKOutboundBulkRequestState = {
      request: {
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
          skipPartyLookup: false,
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
                partyIdentifier: "16135551212"
              },
            },
            amountType: "SEND",
            currency: "USD",
            amount: "123.45",
          }
        ]
      },
      created_at: Date.now(),
      updated_at: Date.now(),
      version: 1,
      id: bulkTransactionId
    }
    const initialBulkRequest: ICommandEventMessageData = {
      key: 'sample-key1',
      name: OutboundCommandEventMessageName.ProcessSDKOutboundBulkRequest,
      content: initialBulkRequestState,
      timestamp: Date.now(),
      headers: []
    }
    const initialBulkRequestCommandEventObj = new CommandEventMessage(initialBulkRequest);
    await producer.sendCommandMessage(initialBulkRequestCommandEventObj);
    await new Promise(resolve => setTimeout(resolve, 1000));

    const bulkPartyInfoRequestCommandEventMessageData: ICommandEventMessageData = {
      key: bulkTransactionId,
      name: OutboundCommandEventMessageName.ProcessSDKOutboundBulkPartyInfoRequest,
      content: null,
      timestamp: Date.now(),
      headers: []
    }
    const bulkPartyInfoRequestCommandEventObj = new CommandEventMessage(bulkPartyInfoRequestCommandEventMessageData);
    await producer.sendCommandMessage(bulkPartyInfoRequestCommandEventObj);
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    // Check the state in Redis
    console.log('bulk id: ', bulkTransactionId);

    const processPartyInfoCallbackMessageData: ICommandEventMessageData = {
      key: bulkTransactionId,
      name: OutboundCommandEventMessageName.ProcessPartyInfoCallback,
      content: {
        partyId : {
          partyIdType: 'MSISDN',
          partyId: '123456',
          fspId: 'receiverfsp'
        }
      },
      timestamp: Date.now(),
      headers: []
    }
    const processPartyInfoCallbackCommandEvent = new CommandEventMessage(processPartyInfoCallbackMessageData);
    await producer.sendCommandMessage(processPartyInfoCallbackCommandEvent);
    
    //Check that the state of individual transfers in bulk to be RECEIVED
    const individualTransfers = (await bulkTransactionEntityRepo.getAllAttributes(bulkTransactionId)).filter((key) => key.includes('individualItem_'))
    // expect((await bulkTransactionEntityRepo.getAttribute(bulkTransactionId, individualTransfers[0])).state).toBe('DISCOVERY_SUCCESS');
    const individualTransferData = await bulkTransactionEntityRepo.getAttribute(bulkTransactionId, individualTransfers[0]);
    console.log('individualTransferData:', individualTransferData);

    // Check domain events published to kafka
    expect(domainEvents[0].getName()).toBe('PartyInfoCallbackProcessed')
    //TODO Add asserts to check data contents of the domain event published to kafka
  });

  test("5. Given receiving party info does not exist \
          And receiving party lookup was not successful \
        When inbound command event ProcessPartyInfoCallback is received \
        Then the state for individual successful party lookups should be updated to DISCOVERY_FAILED \
          And outbound event PartyInfoCallbackProcessed event should be published", async () => {
    
    //Publish this message so that it is stored internally in redis
    const bulkTransactionId = randomUUID();
    const initialBulkRequestState: SDKOutboundBulkRequestState = {
      request: {
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
          skipPartyLookup: false,
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
                partyIdentifier: "16135551212"
              },
            },
            amountType: "SEND",
            currency: "USD",
            amount: "123.45",
          }
        ]
      },
      created_at: Date.now(),
      updated_at: Date.now(),
      version: 1,
      id: bulkTransactionId
    }
    const initialBulkRequest: ICommandEventMessageData = {
      key: 'sample-key1',
      name: OutboundCommandEventMessageName.ProcessSDKOutboundBulkRequest,
      content: initialBulkRequestState,
      timestamp: Date.now(),
      headers: []
    }
    const initialBulkRequestCommandEventObj = new CommandEventMessage(initialBulkRequest);
    await producer.sendCommandMessage(initialBulkRequestCommandEventObj);
    await new Promise(resolve => setTimeout(resolve, 1000));

    const bulkPartyInfoRequestCommandEventMessageData: ICommandEventMessageData = {
      key: bulkTransactionId,
      name: OutboundCommandEventMessageName.ProcessSDKOutboundBulkPartyInfoRequest,
      content: null,
      timestamp: Date.now(),
      headers: []
    }
    const bulkPartyInfoRequestCommandEventObj = new CommandEventMessage(bulkPartyInfoRequestCommandEventMessageData);
    await producer.sendCommandMessage(bulkPartyInfoRequestCommandEventObj);
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    // Check the state in Redis
    console.log('bulk id: ', bulkTransactionId);

    const processPartyInfoCallbackMessageData: ICommandEventMessageData = {
      key: bulkTransactionId,
      name: OutboundCommandEventMessageName.ProcessPartyInfoCallback,
      content: {
        partyId : {
          partyIdType: 'MSISDN',
          partyId: '123456'
        },
        errorInformation: {
          errorCode: 12345
        }
      },
      timestamp: Date.now(),
      headers: []
    }
    const processPartyInfoCallbackCommandEvent = new CommandEventMessage(processPartyInfoCallbackMessageData);
    await producer.sendCommandMessage(processPartyInfoCallbackCommandEvent);
    
    //Check that the state of individual transfers in bulk to be RECEIVED
    const individualTransfers = (await bulkTransactionEntityRepo.getAllAttributes(bulkTransactionId)).filter((key) => key.includes('individualItem_'))
    // expect((await bulkTransactionEntityRepo.getAttribute(bulkTransactionId, individualTransfers[0])).state).toBe('DISCOVERY_FAILED');
    const individualTransferData = await bulkTransactionEntityRepo.getAttribute(bulkTransactionId, individualTransfers[0]);
    console.log('individualTransferData:', individualTransferData);

    // Check domain events published to kafka
    expect(domainEvents[0].getName()).toBe('PartyInfoCallbackProcessed')
    //TODO Add asserts to check data contents of the domain event published to kafka
  });

  test("6. When inbound event ProcessSDKOutboundBulkPartyInfoRequestComplete is received \
        Then the global state should be updated to DISCOVERY_COMPLETED", async () => {
    
    //Publish initial message so that it is stored internally in redis
    const bulkTransactionId = randomUUID();
    const initialBulkRequestState: SDKOutboundBulkRequestState = {
      request: {
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
          skipPartyLookup: false,
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
                partyIdentifier: "16135551212"
              },
            },
            amountType: "SEND",
            currency: "USD",
            amount: "123.45",
          }
        ]
      },
      created_at: Date.now(),
      updated_at: Date.now(),
      version: 1,
      id: bulkTransactionId
    }
    const initialBulkRequest: ICommandEventMessageData = {
      key: 'sample-key1',
      name: OutboundCommandEventMessageName.ProcessSDKOutboundBulkRequest,
      content: initialBulkRequestState,
      timestamp: Date.now(),
      headers: []
    }
    const initialBulkRequestCommandEventObj = new CommandEventMessage(initialBulkRequest);
    await producer.sendCommandMessage(initialBulkRequestCommandEventObj);
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Command event for bulk party info request completed
    const processSDKOutboundBulkPartyInfoRequestCompleteCommandEventMessageData : ICommandEventMessageData = {
      key: bulkTransactionId,
      name: OutboundCommandEventMessageName.ProcessSDKOutboundBulkPartyInfoRequestComplete,
      content: null,
      timestamp: Date.now(),
      headers: []
    }
    const processSDKOutboundBulkPartyInfoRequestCompleteCommandEventMessage = new CommandEventMessage(processSDKOutboundBulkPartyInfoRequestCompleteCommandEventMessageData);
    await producer.sendCommandMessage(processSDKOutboundBulkPartyInfoRequestCompleteCommandEventMessage);
    await new Promise(resolve => setTimeout(resolve, 1000));

    //Check that the global state of individual transfers in bulk to be RECEIVED
    const bulkState = await bulkTransactionEntityRepo.load(bulkTransactionId);
    expect(bulkState.state).toBe('DISCOVERY_COMPLETED');
    
  });

  test("7. Given autoAcceptParty setting is set to false \
        When inbound event ProcessSDKOutboundBulkPartyInfoRequestComplete is received \
        Then outbound event SDKOutboundBulkAcceptpartyInfoRequested should be published \
        And Then global state should be updated to DISCOVERY_ACCEPTANCE_PENDING", async () => {
    
    //Publish initial message so that it is stored internally in redis
    const bulkTransactionId = randomUUID();
    const initialBulkRequestState: SDKOutboundBulkRequestState = {
      request: {
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
          skipPartyLookup: false,
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
                partyIdentifier: "16135551212"
              },
            },
            amountType: "SEND",
            currency: "USD",
            amount: "123.45",
          }
        ]
      },
      created_at: Date.now(),
      updated_at: Date.now(),
      version: 1,
      id: bulkTransactionId
    }
    const initialBulkRequest: ICommandEventMessageData = {
      key: 'sample-key1',
      name: OutboundCommandEventMessageName.ProcessSDKOutboundBulkRequest,
      content: initialBulkRequestState,
      timestamp: Date.now(),
      headers: []
    }
    const initialBulkRequestCommandEventObj = new CommandEventMessage(initialBulkRequest);
    await producer.sendCommandMessage(initialBulkRequestCommandEventObj);
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Command event for bulk party info request completed
    const processSDKOutboundBulkPartyInfoRequestCompleteCommandEventMessageData : ICommandEventMessageData = {
      key: bulkTransactionId,
      name: OutboundCommandEventMessageName.ProcessSDKOutboundBulkPartyInfoRequestComplete,
      content: null,
      timestamp: Date.now(),
      headers: []
    }
    const processSDKOutboundBulkPartyInfoRequestCompleteCommandEventMessage = new CommandEventMessage(processSDKOutboundBulkPartyInfoRequestCompleteCommandEventMessageData);
    await producer.sendCommandMessage(processSDKOutboundBulkPartyInfoRequestCompleteCommandEventMessage);
    await new Promise(resolve => setTimeout(resolve, 1000));

    //Check that the global state of individual transfers in bulk to be RECEIVED
    const bulkState = await bulkTransactionEntityRepo.load(bulkTransactionId);
    expect(bulkState.state).toBe('DISCOVERY_ACCEPTANCE_PENDING');
  });

  // test("8.Given autoAcceptParty setting is set to true \
  //       When Inbound event ProcessSDKOutboundBulkPartyInfoRequestComplete is received \
  //       Then outbound event SDKOutboundBulkAutoAcceptpartyInfoRequested should be published.", async () => {
  //   //TODO add asserts
  // });

  test("9. Given inbound command event ProcessSDKOutboundBulkAcceptPartyInfo is received \
        Then the logic should loop through individual transfer in the bulk request \
          And update the individual transfer state to DISCOVERY_ACCEPTED or DISCOVERY_REJECTED based on the value in the incoming event \
          And update the overall global state to DISCOVERY_ACCEPTANCE_COMPLETED \
          And outbound event SDKOutboundBulkAcceptPartyInfoProcessed should be published", async () => {
    
      //Publish initial message so that it is stored internally in redis
    const bulkTransactionId = randomUUID();
    const initialBulkRequestState: SDKOutboundBulkRequestState = {
      request: {
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
          skipPartyLookup: false,
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
                partyIdentifier: "16135551212"
              },
            },
            amountType: "SEND",
            currency: "USD",
            amount: "123.45",
          }
        ]
      },
      created_at: Date.now(),
      updated_at: Date.now(),
      version: 1,
      id: bulkTransactionId
    }
    const initialBulkRequest: ICommandEventMessageData = {
      key: 'sample-key1',
      name: OutboundCommandEventMessageName.ProcessSDKOutboundBulkRequest,
      content: initialBulkRequestState,
      timestamp: Date.now(),
      headers: []
    }
    const initialBulkRequestCommandEventObj = new CommandEventMessage(initialBulkRequest);
    await producer.sendCommandMessage(initialBulkRequestCommandEventObj);
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Command event for bulk party info request completed
    const processSDKOutboundBulkPartyInfoRequestCompleteCommandEventMessageData : ICommandEventMessageData = {
      key: bulkTransactionId,
      name: OutboundCommandEventMessageName.ProcessSDKOutboundBulkPartyInfoRequestComplete,
      content: null,
      timestamp: Date.now(),
      headers: []
    }
    const processSDKOutboundBulkPartyInfoRequestCompleteCommandEventMessage = new CommandEventMessage(processSDKOutboundBulkPartyInfoRequestCompleteCommandEventMessageData);
    await producer.sendCommandMessage(processSDKOutboundBulkPartyInfoRequestCompleteCommandEventMessage);
    await new Promise(resolve => setTimeout(resolve, 1000));

    //Check that the global state of individual transfers in bulk to be RECEIVED
    const bulkState = await bulkTransactionEntityRepo.load(bulkTransactionId);
    expect(bulkState.state).toBe('DISCOVERY_ACCEPTANCE_COMPLETED');

  });

  // test("10. Given Inbound command event ProcessSDKOutboundBulkAcceptPartyInfo \
  //       Then the logic should loop through individual transfer in the bulk request \
  //         And update the individual transfer state to DISCOVERY_ACCEPTED or DISCOVERY_REJECTED based on the value in the incoming event", async () => {
  //   //TODO add asserts
  // });

  // // TESTS FOR QUOTE PROCESSING

  // test("When Inbound command event ProcessSDKOutboundBulkQuotesRequest is received\
  //       Then the logic should update the global state to AGREEMENT_PROCESSING, \
  //         And create batches based on FSP that has DISCOVERY_ACCEPTED state \
  //         And also has config maxEntryConfigPerBatch \
  //         And publish BulkQuotesRequested per each batch \
  //         And update the state of each batch to AGREEMENT_PROCESSING.", async () => {
  //   //TODO add asserts
  // });

  // test("Given Inbound command event ProcessBulkQuotesCallback for success requests \
  //        Then the logic should update the individual batch state to AGREEMENT_PROCESSING, \
  //         And create batches based on FSP that has DISCOVERY_ACCEPTED state \
  //        And also has config maxEntryConfigPerBatch \
  //        And publish BulkQuotesRequested per each batch \
  //        And update the state of each batch to AGREEMENT_PROCESSING.", async () => {
  //   //TODO add asserts
  // });
});
