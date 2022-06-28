/**************************************************************************
 *  (C) Copyright ModusBox Inc. 2020 - All rights reserved.               *
 *                                                                        *
 *  This file is made available under the terms of the license agreement  *
 *  specified in the corresponding source code repository.                *
 *                                                                        *
 *  ORIGINAL AUTHOR:                                                      *
 *      Steven Oderayi - steven.oderayi@modusbox.com                       *
 **************************************************************************/

const { EventEmitter } = require('events');

/**************************************************************************
 * Internal events received by the control server via the exposed internal 
 * event emitter. 
 *************************************************************************/
const INTERNAL_EVENTS = {
    SERVER: {
        BROADCAST_CONFIG_CHANGE: 'BROADCAST_CONFIG_CHANGE',
    }
};
const internalEventEmitter = new EventEmitter();

/**************************************************************************
 * getInternalEventEmitter
 *
 * Returns an EventEmmitter that can be used to exchange internal events with 
 * either the control server or the client from other modules within this service. 
 * This prevents the need to pass down references to either the server or the client 
 * from one module to another in order to use their interfaces.
 * 
 * @returns {events.EventEmitter}
 *************************************************************************/
const getInternalEventEmitter = () => {
    return internalEventEmitter;
};

module.exports = {
    getInternalEventEmitter,
    INTERNAL_EVENTS
};
