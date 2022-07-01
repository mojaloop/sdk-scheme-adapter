/*****
 License
 --------------
 ISC License
 Copyright 2020 Khalil Stemmler
 Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.
 THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 --------------
 ******/

import { MockJobCreatedEvent } from "../events/mockJobCreatedEvent";
import { MockJobDeletedEvent } from "../events/mockJobDeletedEvent";
import { IHandle } from "../../../IHandle";
import { DomainEvents } from "../../../DomainEvents";

export class MockPostToSocial implements IHandle<MockJobCreatedEvent>, IHandle<MockJobDeletedEvent> {
  constructor () {

  }

  /**
   * This is how we may setup subscriptions to domain events.
   */

  setupSubscriptions (): void {
    DomainEvents.register(this.handleJobCreatedEvent, MockJobCreatedEvent.name);
    DomainEvents.register(this.handleDeletedEvent, MockJobDeletedEvent.name);
  }

  /**
   * These are examples of how we define the handlers for domain events.
   */

  handleJobCreatedEvent (event: MockJobCreatedEvent): void {
    console.log('A job was created!!!')
  }

  handleDeletedEvent (event: MockJobDeletedEvent): void {
    console.log('A job was deleted!!!')
  }
}