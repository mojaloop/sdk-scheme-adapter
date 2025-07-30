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
 - Vijay Kumar Guthi <vijaya.guthi@infitx.com>

 --------------
 ******/

import { EventType, DomainEvent } from '../../../src';

const sampleDomainEventData: any = {
  key: 'sample-key1',
  name: 'some-event-name-here',
  content: null,
  timestamp: Date.now(),
  headers: []
}

const sampleIMessage: any = {
  key: 'sample-key1',
  value: {
    eventType: EventType.DOMAIN_EVENT,
    eventName: 'some-event-name-here',
    eventContent: null
  },
  topic: 'sample-topic',
  timestamp: Date.now(),
  headers: []
}

describe ('DomainEvent', () => {
  describe("Positive scenarios", () => {
    it("should create a domain event message object from event message data", () => {
      const eventObj = new DomainEvent(sampleDomainEventData);
      expect(eventObj).not.toBeUndefined();
      expect(eventObj.getKey()).toEqual(sampleDomainEventData.key)
      expect(eventObj.getTimeStamp()).toEqual(sampleDomainEventData.timestamp)
      expect(eventObj.getType()).toEqual(EventType.DOMAIN_EVENT)
      expect(eventObj).toBeInstanceOf(DomainEvent)
    });
    it("should create a domain event message object from imessage object", () => {
      const eventObj = DomainEvent.CreateFromIMessage(sampleIMessage);
      expect(eventObj).not.toBeUndefined();
      expect(eventObj.getKey()).toEqual(sampleIMessage.key)
      expect(eventObj.getTimeStamp()).toEqual(sampleIMessage.timestamp)
      expect(eventObj.getType()).toEqual(sampleIMessage.value.eventType)
      expect(eventObj).toBeInstanceOf(DomainEvent)
    });
    it("should create a domain event message object from event message data and generate iMessage", () => {
      const eventObj = new DomainEvent(sampleDomainEventData);
      expect(eventObj).not.toBeUndefined();
      expect(eventObj.getKey()).toEqual(sampleDomainEventData.key)
      const iMessage = eventObj.toIMessage('some-supplied-topic');
      expect(iMessage.key).toEqual(sampleDomainEventData.key)
      expect(iMessage.timestamp).toEqual(sampleDomainEventData.timestamp)
      expect(iMessage.topic).toEqual('some-supplied-topic')
      expect(iMessage.value).toHaveProperty('eventType')
      expect(iMessage.value).toHaveProperty('eventName')
    });
  });
  describe("Negative scenarios", () => {
    it("should throw an error if the .key is null", () => {
      expect(() => { DomainEvent.CreateFromIMessage({ ...sampleIMessage, key: null}) }).toThrow()
    });
    it("should throw an error if the .value is null", () => {
      expect(() => { DomainEvent.CreateFromIMessage({ ...sampleIMessage, value: null}) }).toThrow()
    });
    it("should throw an error if the .value is not object", () => {
      expect(() => { DomainEvent.CreateFromIMessage({ ...sampleIMessage, value: 'some-string'}) }).toThrow()
    });
    it("should throw an error if the .value.eventType doesn't exist", () => {
      expect(() => { DomainEvent.CreateFromIMessage({ ...sampleIMessage, value: {...sampleIMessage.value, eventType: null}}) }).toThrow()
    });
    it("should throw an error if the .value.eventName doesn't exist", () => {
      expect(() => { DomainEvent.CreateFromIMessage({ ...sampleIMessage, value: {...sampleIMessage.value, eventName: null}}) }).toThrow()
    });
    it("should throw an error if the .value.eventType is not DOMAIN_EVENT", () => {
      expect(() => { DomainEvent.CreateFromIMessage({ ...sampleIMessage, value: {...sampleIMessage.value, eventType: EventType.COMMAND_EVENT}}) }).toThrow()
    });
  });

})
