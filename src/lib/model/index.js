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


const inboundTransfersModel = require('./inboundModel.js');
const outboundTransfersModel = require('./outboundModel.js');


module.exports = {
    inboundTransfersModel: inboundTransfersModel,
    outboundTransfersModel: outboundTransfersModel
};
