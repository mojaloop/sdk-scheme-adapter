/**************************************************************************
 *  (C) Copyright ModusBox Inc. 2019 - All rights reserved.               *
 *                                                                        *
 *  This file is made available under the terms of the license agreement  *
 *  specified in the corresponding source code repository.                *
 *                                                                        *
 *  ORIGINAL AUTHOR:                                                      *
 *      Steven Oderayi - steven.oderayi@modusbox.com                       *
 **************************************************************************/

'use strict';

// Add non-standard/custom JSON-Schema keys to the API spec. 
// Initial implementation basically replaces "pattern" key
// with "regexp: { pattern: '<REGEX>', flags: '<REGEX-FLAGS>' }" 
// used in conjunction with 'ajv-keywords' to support validation
// of unicode character classes.
const addCustomKeys = (originalSchema, regexFlags = 'u') => {
    const key = 'pattern';
    const clonedSchema = JSON.parse(JSON.stringify(originalSchema));
    updateSchema(clonedSchema, key, regexFlags);
    return clonedSchema;
};

const updateSchema = (obj, key, regexFlags) => {
    let objects = [];
    for (const i in obj) {
        if (obj.hasOwnProperty(i)) {
            if (typeof obj[i] === 'object') {
                objects = objects.concat(updateSchema(obj[i], key, regexFlags));
            } else if (i === key) {
                if (!obj.regexp && !obj.flags) {
                    obj.regexp = {
                        pattern: obj[i]
                    };
                    if (regexFlags) {
                        obj.regexp.flags = regexFlags;
                    }
                    delete obj.pattern;
                }
            }
        }
    }
};

module.exports = { addCustomKeys };
