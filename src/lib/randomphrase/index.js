/**************************************************************************
 *  (C) Copyright ModusBox Inc. 2019 - All rights reserved.               *
 *                                                                        *
 *  This file is made available under the terms of the license agreement  *
 *  specified in the corresponding source code repository.                *
 *                                                                        *
 *  ORIGINAL AUTHOR:                                                      *
 *       Matt Kingston - matt.kingston@modusbox.com                       *
 **************************************************************************/

'use strict';

const words = require('./words.json');

const randomEl = arr => arr[Math.floor(Math.random() * arr.length)];
module.exports = (separator = '-') => [
    randomEl(words.adjectives),
    randomEl(words.nouns),
    randomEl(words.adjectives),
    randomEl(words.nouns)
].join(separator);
