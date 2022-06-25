/**************************************************************************
 *  (C) Copyright ModusBox Inc. 2019 - All rights reserved.               *
 *                                                                        *
 *  This file is made available under the terms of the license agreement  *
 *  specified in the corresponding source code repository.                *
 *                                                                        *
 *  ORIGINAL AUTHOR:                                                      *
 *       Yevhen Kyriukha - yevhen.kyriukha@modusbox.com                   *
 **************************************************************************/

const StateMachine = jest.requireActual('javascript-state-machine');


class MockStateMachine extends StateMachine {
    constructor(...args) {
        super(...args);
        MockStateMachine.__instance = this;
    }
}

module.exports = MockStateMachine;
