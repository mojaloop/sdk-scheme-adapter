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

import { EventMessageType, CommandEventMessage } from "../../../src/events";

const sampleCommandEventMessage: any = {
  key: 'sample-key1',
  value: {
    eventMessageType: EventMessageType.COMMAND_EVENT,
    eventMessageName: 'some-event-name-here',
    eventMessageContent: null
  },
  topic: 'sample-topic',
  timestamp: Date.now(),
  headers: []
}

describe ('CommandEventMessage', () => {
  describe("Positive scenarios", () => {
    it("should create a domain event message object", () => {
      const commandEventObj = new CommandEventMessage(sampleCommandEventMessage);
      expect(commandEventObj).not.toBeUndefined();
      expect(commandEventObj.getKey()).toEqual(sampleCommandEventMessage.key)
      expect(commandEventObj.getTimeStamp()).toEqual(sampleCommandEventMessage.timestamp)
      expect(commandEventObj.getType()).toEqual(sampleCommandEventMessage.value.eventMessageType)
    });
  });
  describe("Negative scenarios", () => {
    it("should throw an error if the .key is null", () => {
      expect(() => { new CommandEventMessage({ ...sampleCommandEventMessage, key: null}) }).toThrowError()
    });
    it("should throw an error if the .value is null", () => {
      expect(() => { new CommandEventMessage({ ...sampleCommandEventMessage, value: null}) }).toThrowError()
    });
    it("should throw an error if the .value is not object", () => {
      expect(() => { new CommandEventMessage({ ...sampleCommandEventMessage, value: 'some-string'}) }).toThrowError()
    });
    it("should throw an error if the .value.eventMessageType doesn't exist", () => {
      expect(() => { new CommandEventMessage({ ...sampleCommandEventMessage, value: {...sampleCommandEventMessage.value, eventMessageType: null}}) }).toThrowError()
    });
    it("should throw an error if the .value.eventMessageName doesn't exist", () => {
      expect(() => { new CommandEventMessage({ ...sampleCommandEventMessage, value: {...sampleCommandEventMessage.value, eventMessageName: null}}) }).toThrowError()
    });
    it("should throw an error if the .value.eventMessageType is not DOMAIN_EVENT", () => {
      expect(() => { new CommandEventMessage({ ...sampleCommandEventMessage, value: {...sampleCommandEventMessage.value, eventMessageType: EventMessageType.DOMAIN_EVENT}}) }).toThrowError()
    });
  });

})
