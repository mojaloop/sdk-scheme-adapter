/**
 * Created by pedrosousabarreto@gmail.com on 29/May/2020.
 */

"use strict";

// just for the tests, we don't want to depend on the external logger
import {ILogger} from "../../../src/ilogger";

export class SimpleLogger implements ILogger {
  // trace(...anything) {
  //  console.trace.apply(this, anything);
  // }

  isDebugEnabled = () => false
  isInfoEnabled = () => false
  isWarnEnabled = () => true
  isErrorEnabled = () => false
  isFatalEnabled = () => false

  debug = jest.fn()
  
  info = jest.fn()

  warn = jest.fn()

  error = jest.fn()

  fatal = jest.fn()
}
