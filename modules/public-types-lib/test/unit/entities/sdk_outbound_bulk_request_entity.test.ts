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

import { SDKOutboundBulkRequestEntity, SDKOutboundBulkRequestState } from '../../../src/entities'

const sampleSDKOutboundBulkRequest: any = {
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
    merchantClassificationCode: "string",
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
      homeTransactionId: "b51ec534-ee48-4575-b6a9-ead2955b8069",
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
        merchantClassificationCode: "string",
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
}

// const sampleIMessage: any = {
//   key: 'sample-key1',
//   value: {
//     eventMessageType: EventMessageType.DOMAIN_EVENT,
//     eventMessageName: 'some-event-name-here',
//     eventMessageContent: null
//   },
//   topic: 'sample-topic',
//   timestamp: Date.now(),
//   headers: []
// }

describe ('SDKOutboundBulkRequestEntity', () => {
  describe("Positive scenarios", () => {
    it("should create a object instance", () => {
      const entityObj = SDKOutboundBulkRequestEntity.CreateFromRequest(sampleSDKOutboundBulkRequest);
      console.log(entityObj)
      expect(entityObj).not.toBeUndefined();
      // expect(() => { new SDKOutboundBulkRequestEntity(sampleSDKOutboundBulkRequestState) }).toThrowError()
      // expect(eventObj.getKey()).toEqual(sampleDomainEventMessageData.key)
      // expect(eventObj.getTimeStamp()).toEqual(sampleDomainEventMessageData.timestamp)
      // expect(eventObj.getType()).toEqual(EventMessageType.DOMAIN_EVENT)
      // expect(eventObj).toBeInstanceOf(DomainEventMessage)
    });
    // it("should create a domain event message object from imessage object", () => {
    //   const eventObj = DomainEventMessage.createFromIMessage(sampleIMessage);
    //   expect(eventObj).not.toBeUndefined();
    //   expect(eventObj.getKey()).toEqual(sampleIMessage.key)
    //   expect(eventObj.getTimeStamp()).toEqual(sampleIMessage.timestamp)
    //   expect(eventObj.getType()).toEqual(sampleIMessage.value.eventMessageType)
    //   expect(eventObj).toBeInstanceOf(DomainEventMessage)
    // });
    // it("should create a domain event message object from event message data and generate iMessage", () => {
    //   const eventObj = new DomainEventMessage(sampleDomainEventMessageData);
    //   expect(eventObj).not.toBeUndefined();
    //   expect(eventObj.getKey()).toEqual(sampleDomainEventMessageData.key)
    //   const iMessage = eventObj.toIMessage('some-supplied-topic');
    //   expect(iMessage.key).toEqual(sampleDomainEventMessageData.key)
    //   expect(iMessage.timestamp).toEqual(sampleDomainEventMessageData.timestamp)
    //   expect(iMessage.topic).toEqual('some-supplied-topic')
    //   expect(iMessage.value).toHaveProperty('eventMessageType')
    //   expect(iMessage.value).toHaveProperty('eventMessageName')
    // });
  });
  // describe("Negative scenarios", () => {
  //   it("should throw an error if the .key is null", () => {
  //     expect(() => { DomainEventMessage.createFromIMessage({ ...sampleIMessage, key: null}) }).toThrowError()
  //   });
  //   it("should throw an error if the .value is null", () => {
  //     expect(() => { DomainEventMessage.createFromIMessage({ ...sampleIMessage, value: null}) }).toThrowError()
  //   });
  //   it("should throw an error if the .value is not object", () => {
  //     expect(() => { DomainEventMessage.createFromIMessage({ ...sampleIMessage, value: 'some-string'}) }).toThrowError()
  //   });
  //   it("should throw an error if the .value.eventMessageType doesn't exist", () => {
  //     expect(() => { DomainEventMessage.createFromIMessage({ ...sampleIMessage, value: {...sampleIMessage.value, eventMessageType: null}}) }).toThrowError()
  //   });
  //   it("should throw an error if the .value.eventMessageName doesn't exist", () => {
  //     expect(() => { DomainEventMessage.createFromIMessage({ ...sampleIMessage, value: {...sampleIMessage.value, eventMessageName: null}}) }).toThrowError()
  //   });
  //   it("should throw an error if the .value.eventMessageType is not DOMAIN_EVENT", () => {
  //     expect(() => { DomainEventMessage.createFromIMessage({ ...sampleIMessage, value: {...sampleIMessage.value, eventMessageType: EventMessageType.COMMAND_EVENT}}) }).toThrowError()
  //   });
  // });

})
