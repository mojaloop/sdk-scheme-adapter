/**
 * Created by pedrosousabarreto@gmail.com on 02/Jun/2020.
 */

"use strict";

import {IMessage} from '../../../src/messages';
import {ILogger} from '../../../src/ilogger';
import {IMessagePublisher} from '../../../src/imessage_publisher';
import {SimpleLogger} from '../utilities/simple_logger';

export class InMemMessagePublisher implements IMessagePublisher {
  private _messages: IMessage[]
  private _logger: ILogger

  constructor (logger: ILogger) {
    this._logger = logger
    this._messages = []
  }

  async init (): Promise<void> {
    this._logger.isDebugEnabled() && this._logger.debug(`InMemPublisher message published initialised`)
    return Promise.resolve()
  }

  async destroy (): Promise<void> {
    this._logger.isDebugEnabled() && this._logger.debug(`InMemPublisher message published destroyed`)
    return Promise.resolve()
  }

  async publish (message: IMessage): Promise<void> {
    this._messages.push(message);
    this._logger.isDebugEnabled() && this._logger.debug(`InMemPublisher message published to topic: ${message.msgTopic} `)
    return Promise.resolve();
  }

  async publishMany (messages: IMessage[]): Promise<void> {
    const promises: Promise<void>[] =  messages.map((msg:IMessage)=>{
      return this.publish(msg)
    })

    Promise.all(promises)
  }
}
