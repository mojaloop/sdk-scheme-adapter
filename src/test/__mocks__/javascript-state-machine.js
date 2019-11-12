const StateMachine = require.requireActual('javascript-state-machine');


class MockStateMachine extends StateMachine {
    constructor(...args) {
        super(...args);
        MockStateMachine.__instance = this;
    }
}

module.exports = MockStateMachine;
