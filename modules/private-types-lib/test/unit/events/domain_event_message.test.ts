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

import { EventMessageType, DomainEventMessage } from "../../../src/events";

const sampleDomainEventMessageData: any = {
  key: 'sample-key1',
  type: EventMessageType.DOMAIN_EVENT,
  name: 'some-event-name-here',
  content: null,
  timestamp: Date.now(),
  headers: []
}

const sampleIMessage: any = {
  key: 'sample-key1',
  value: {
    eventMessageType: EventMessageType.DOMAIN_EVENT,
    eventMessageName: 'some-event-name-here',
    eventMessageContent: null
  },
  topic: 'sample-topic',
  timestamp: Date.now(),
  headers: []
}

describe ('DomainEventMessage', () => {
  describe("Positive scenarios", () => {
    it("should create a domain event message object from event message data", () => {
      const domainEventObj = new DomainEventMessage(sampleDomainEventMessageData);
      expect(domainEventObj).not.toBeUndefined();
      expect(domainEventObj.getKey()).toEqual(sampleDomainEventMessageData.key)
      expect(domainEventObj.getTimeStamp()).toEqual(sampleDomainEventMessageData.timestamp)
      expect(domainEventObj.getType()).toEqual(sampleDomainEventMessageData.type)
    });
    it("should create a domain event message object from imessage object", () => {
      const domainEventObj = DomainEventMessage.createFromIMessage(sampleIMessage);
      expect(domainEventObj).not.toBeUndefined();
      expect(domainEventObj.getKey()).toEqual(sampleIMessage.key)
      expect(domainEventObj.getTimeStamp()).toEqual(sampleIMessage.timestamp)
      expect(domainEventObj.getType()).toEqual(sampleIMessage.value.eventMessageType)
    });
    it("should create a domain event message object from event message data and generate iMessage", () => {
      const domainEventObj = new DomainEventMessage(sampleDomainEventMessageData);
      expect(domainEventObj).not.toBeUndefined();
      expect(domainEventObj.getKey()).toEqual(sampleDomainEventMessageData.key)
      const iMessage = domainEventObj.toIMessage('some-supplied-topic');
      expect(iMessage.key).toEqual(sampleDomainEventMessageData.key)
      expect(iMessage.timestamp).toEqual(sampleDomainEventMessageData.timestamp)
      expect(iMessage.topic).toEqual('some-supplied-topic')
      expect(iMessage.value).toHaveProperty('eventMessageType')
      expect(iMessage.value).toHaveProperty('eventMessageName')
    });
  });
  describe("Negative scenarios", () => {
    it("should throw an error if the .key is null", () => {
      expect(() => { DomainEventMessage.createFromIMessage({ ...sampleIMessage, key: null}) }).toThrowError()
    });
    it("should throw an error if the .value is null", () => {
      expect(() => { DomainEventMessage.createFromIMessage({ ...sampleIMessage, value: null}) }).toThrowError()
    });
    it("should throw an error if the .value is not object", () => {
      expect(() => { DomainEventMessage.createFromIMessage({ ...sampleIMessage, value: 'some-string'}) }).toThrowError()
    });
    it("should throw an error if the .value.eventMessageType doesn't exist", () => {
      expect(() => { DomainEventMessage.createFromIMessage({ ...sampleIMessage, value: {...sampleIMessage.value, eventMessageType: null}}) }).toThrowError()
    });
    it("should throw an error if the .value.eventMessageName doesn't exist", () => {
      expect(() => { DomainEventMessage.createFromIMessage({ ...sampleIMessage, value: {...sampleIMessage.value, eventMessageName: null}}) }).toThrowError()
    });
    it("should throw an error if the .value.eventMessageType is not DOMAIN_EVENT", () => {
      expect(() => { DomainEventMessage.createFromIMessage({ ...sampleIMessage, value: {...sampleIMessage.value, eventMessageType: EventMessageType.COMMAND_EVENT}}) }).toThrowError()
    });
  });

})
