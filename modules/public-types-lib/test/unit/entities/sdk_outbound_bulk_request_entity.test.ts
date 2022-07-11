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

import { SDKOutboundBulkRequestEntity } from '../../../src/entities'

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
}

describe ('SDKOutboundBulkRequestEntity', () => {
  describe("Positive scenarios", () => {
    it("should create a object instance", () => {
      const entityObj = SDKOutboundBulkRequestEntity.CreateFromRequest(sampleSDKOutboundBulkRequest);
      expect(entityObj).not.toBeUndefined();
      expect(entityObj).toHaveProperty('id')
      expect(entityObj.id).toEqual(sampleSDKOutboundBulkRequest.bulkTransactionId)
      expect(entityObj.request).toMatchObject(sampleSDKOutboundBulkRequest)
    });
    it("should create a object with a new bulkTransactionId if not passed", () => {
      const entityObj = SDKOutboundBulkRequestEntity.CreateFromRequest({ ...sampleSDKOutboundBulkRequest, bulkTransactionId: undefined});
      expect(entityObj).not.toBeUndefined();
      expect(entityObj).toHaveProperty('id')
      expect(entityObj.request).toHaveProperty('bulkTransactionId')
      expect(entityObj.id).toEqual(entityObj.request.bulkTransactionId)
    });
  });
  describe("Negative scenarios", () => {
    it("should throw an error if the .bulkHomeTransactionID is undefined", () => {
      expect(() => { SDKOutboundBulkRequestEntity.CreateFromRequest({ ...sampleSDKOutboundBulkRequest, bulkHomeTransactionID: undefined}) }).toThrowError()
    });
    it("should throw an error if the .bulkTransactionId is not in proper format", () => {
      expect(() => { SDKOutboundBulkRequestEntity.CreateFromRequest({ ...sampleSDKOutboundBulkRequest, bulkTransactionId: 123}) }).toThrowError()
    });
    it("should throw an error if the .from is undefined", () => {
      expect(() => { SDKOutboundBulkRequestEntity.CreateFromRequest({ ...sampleSDKOutboundBulkRequest, from: undefined}) }).toThrowError()
    });
  });

})
