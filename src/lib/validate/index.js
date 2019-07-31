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


// TODO: is it worth bringing in an external lib just for converting params to JSON schema?
// Consider replacing this.
const paramsToJsonSchema = require('openapi-jsonschema-parameters').convertParametersToJSONSchema;
const jsrp = require('json-schema-ref-parser');
const util = require('util');

const { Errors } = require('@modusbox/mojaloop-sdk-standard-components');

// Don't stop at the first error, we'll let the user know what all their errors are. Also, when we
// validate, coerce types to those we're interested in where possible.
const ajv = new require('ajv')({ allErrors: true, coerceTypes: true });

const httpMethods = ['get', 'head', 'post', 'put', 'delete', 'connnect', 'options', 'trace', 'patch'];

// Create a json schema in the format we've chosen to use
const createSchema = (pathValue, methodValue) => {
    let properties = {
        ...paramsToJsonSchema([ ...(pathValue.parameters || []), ...(methodValue.parameters || []) ]),
        body: extractBody(methodValue.requestBody) || {}
    };
    // Make all header keys lower-case
    if ('headers' in properties && 'properties' in properties.headers) {
        properties.headers.properties = Object.assign(
            ...Object.entries(properties.headers.properties).map(([headerName, value]) => ({ [headerName.toLowerCase()]: value })));
        properties.headers.required = properties.headers.required.map(r => r.toLowerCase());
    }
    const required = Object.entries(properties)
        .filter(([, value]) => value.required && value.required.length > 0)
        .map(([prop,]) => prop);
    return {
        type: 'object',
        properties,
        required
    };
};

// Extract the body schema if it's nested within content.'application/json'
const extractBody = rqBody => {
    if (rqBody && 'content' in rqBody) {
        if ('application/json' in rqBody.content) {
            return rqBody.content['application/json'].schema;
        }
        // TODO: handle more content types
        throw new Error('Unhandled content type');
    }
    return rqBody;
};

// Here we're transforming the incoming openapi spec to combine path-level parameters and
// method-level parameters, to get everything in the format we'll validate with.
//
// Input:
// {
//   /path/to/resource: {
//     parameters: { required: true, in: "headers", name: "content-type", type: "integer" },
//     get": {
//       parameters: { required: true, in: "query", name: "length", type: "integer" },
//       requestBody: { "$ref": "#/components/requestBodies/someBodyObj" }
//     }
//   }
// }
//
// Output:
// {
//   /path/to/resource: {
//     get: {
//       validator: {
//         [ Function validate ]
//         schema: {
//           query: { properties: { length: { type: "string" } }, required: ["length"] },
//           body: { "$ref": "#/components/requestBodies/someBodyObj" },
//           headers: { properties: { "content-type": { type: "integer" } }, required: ["content-type"] }
//         }
//       }
//     }
//   }
// }
const transformApiDoc = apiDoc => ({
    ...apiDoc,
    // TODO: as we now discard most of the extra information, it probably makes sense to explicitly
    // return the object form we're interested in, rather than do all of this awkward object
    // mapping. I.e.:
    // return { get: { validator: [Function validator] }, put: { validator: [Function validator] } };
    paths: Object.assign(...Object.entries(apiDoc.paths).map(([pathName, pathValue]) => ({
        [pathName]: Object.assign(
            ...Object.entries(pathValue)
                .filter(([method,]) => httpMethods.includes(method))
                .map(([method, methodValue]) => {
                    const schema = createSchema(pathValue, methodValue);
                    const validatorF = ajv.compile(schema);
                    return {
                        [method]: {
                            validator: (ctx, path) => {
                                const result = validatorF({
                                    body: ctx.request.body,
                                    headers: ctx.request.headers,
                                    params: ctx.params,
                                    query: ctx.request.query,
                                    path
                                });
                                if (result === true) {
                                    return undefined;
                                }
                                return validatorF.errors;
                            }
                        }
                    };
                })
        )
    })))
});

class Validator {
    // apiDoc
    //   POJO representing apiDoc API spec. Example:
    //   const v = new Validator(require('./apiDoc.json'));
    async initialise(apiDoc) {
        // Dereferencing the api doc makes it much easier to work with. Specifically, it allows us
        // to compile a validator for each path.
        const pojoApiDoc = await jsrp.dereference(apiDoc);

        this.apiDoc = transformApiDoc(pojoApiDoc);
        const pathParamMatch = /\{[^{}]+\}/g;
        this.paths = Object.entries(this.apiDoc.paths).map(([path, pathSpec]) => ({
            pattern: path,
            matcher: {
                // If we were using node 10, instead of having this awkward params object, we could
                // replace the path parameters with named regex matches corresponding to the path
                // names.
                regex: new RegExp(`^${path.replace(pathParamMatch, '([^{}/]+)')}$`),
                params: (path.match(pathParamMatch) || []).map(s => s.replace(/(^{|}$)/g, ''))
            },
            methods: { ...pathSpec }
        }));
    }

    // TODO: roll the entire validation functionality into a single function? Or split it out into
    // path, headers, body, query? Or neither? If we validate the body separately, we can avoid
    // parsing the body until (and unless) it comes time for body validation. BUT this means we
    // won't tell the user everything that's wrong with their request in a single response, which
    // is probably more valuable, given the purpose of the simulator. However; having the lib
    // support this option would be good.
    validatePath(path, logger) {
        let result = this.paths.find(p => path.match(p.matcher.regex) !== null);

        if (result === undefined) {
            throw new Errors.MojaloopFSPIOPError(null, `Couldn't match path ${path}`, null,
                Errors.MojaloopApiErrorCodes.UNKNOWN_URI);
        }
        result.params = Object.assign({}, ...path.match(result.matcher.regex).slice(1).map((m, i) => ({ [result.matcher.params[i]]: m})));

        logger.push({ path, result }).log('Matched path');
        return result;
    }


    validateRequest(ctx, logger) {
        const path = this.validatePath(ctx.path, logger);
        if (!(ctx.method.toLowerCase() in path.methods)) {
            const err = new Error(`Method ${ctx.method} not supported for path ${ctx.path}`);
            err.httpStatusCode = 405;
            throw err;
        }

        const validationResult = path.methods[ctx.method.toLowerCase()].validator(ctx, path.params);

        if (validationResult !== undefined && validationResult.length > 0) {
            logger.push({ validationResult }).log('Validation result');

            let err;
            const firstError = validationResult[0];

            if(firstError.keyword === 'required') {
                // this is a missing required property; there is a specific mojaloop api spec error code for this
                err = new Errors.MojaloopFSPIOPError(firstError, util.format('Request failed validation', 
                    validationResult), null, Errors.MojaloopApiErrorCodes.MISSING_ELEMENT);

                // overwrite the defaul error message with something more useful
                err.apiErrorCode.message = `${firstError.dataPath} ${firstError.message}`;
                throw err;
            }

            err =  new Error(util.format('Request failed validation', validationResult));
            Object.assign(err, firstError);
            throw err;
        }
        return path;
    }
}

module.exports = Validator;
