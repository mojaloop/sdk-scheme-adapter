/**************************************************************************
 *  (C) Copyright ModusBox Inc. 2020 - All rights reserved.               *
 *                                                                        *
 *  This file is made available under the terms of the license agreement  *
 *  specified in the corresponding source code repository.                *
 *                                                                        *
 *  ORIGINAL AUTHOR:                                                      *
 *       Matt Kingston - matt.kingston@modusbox.com                       *
 **************************************************************************/

// This module maps all methods on Node assert to non-throwing "check" functions which return true
// if the assertion succeeded and false otherwise

const assert = require('assert').strict;

module.exports = Object.fromEntries(
    Object.entries(assert).map(([k, f]) => [k, (...args) => {
        try {
            f.bind(assert)(...args);
            return true;
        } catch {
            return false;
        }
    }])
);
