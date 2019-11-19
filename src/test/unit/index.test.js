/**************************************************************************
 *  (C) Copyright ModusBox Inc. 2019 - All rights reserved.               *
 *                                                                        *
 *  This file is made available under the terms of the license agreement  *
 *  specified in the corresponding source code repository.                *
 *                                                                        *
 *  ORIGINAL AUTHOR:                                                      *
 *       James Bush - james.bush@modusbox.com                             *
 **************************************************************************/

'use strict';

const index = require('../../index.js');


describe('index.js', () => {
    test('Exports expected modules', () => {
        expect(typeof(index.Server)).toBe('function');
        expect(typeof(index.InboundServerMiddleware)).toBe('object');
        expect(typeof(index.OutboundServerMiddleware)).toBe('object');
        expect(typeof(index.Router)).toBe('function');
        expect(typeof(index.Validate)).toBe('function');
        expect(typeof(index.RandomPhrase)).toBe('function');
        expect(typeof(index.Log)).toBe('object');
        expect(typeof(index.Cache)).toBe('function');
    });
});
