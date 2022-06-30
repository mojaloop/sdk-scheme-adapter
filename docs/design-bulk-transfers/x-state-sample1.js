import { createMachine } from 'xstate';
const lightMachine = createMachine({
  // not a parallel machine
  id: 'SDKBulkTransfers',
  initial: 'RECEIVED',
  states: {
    RECEIVED: {
      on: {
        start: { target: 'DISCOVERY_PROCESSING' }
      }
    },
    DISCOVERY_PROCESSING: {
      type: 'parallel',
      states: {
        party1: {
          initial: 'DISCOVERY_PROCESSING',
          states: {
            DISCOVERY_PROCESSING: {
              on: {
                party1_success_callback: { target: 'DISCOVERY_SUCCESS' },
                party1_error_callback: { target: 'DISCOVERY_FAILED' }
              }
            },
            DISCOVERY_SUCCESS: {
              on: {
                checkRemainingItems: { target: 'DONE' }
              }
            },
            DISCOVERY_FAILED: {
              on: {
                checkRemainingItems: { target: 'DONE' }
              }
            },
            DONE: {
              type: 'final'
            }
          }
        },
        party2: {
          initial: 'DISCOVERY_PROCESSING',
          states: {
            DISCOVERY_PROCESSING: {
              on: {
                party2_success_callback: { target: 'DISCOVERY_SUCCESS' },
                party2_error_callback: { target: 'DISCOVERY_FAILED' }
              }
            },
            DISCOVERY_SUCCESS: {
              on: {
                checkRemainingItems: { target: 'DONE' }
              }
            },
            DISCOVERY_FAILED: {
              on: {
                checkRemainingItems: { target: 'DONE' }
              }
            },
            DONE: {
              type: 'final'
            }
          }
        }
      },
      on: {
        onDone: { target: 'DISCOVERY_COMPLETED'}
      }
    },
    DISCOVERY_COMPLETED: {
      type: 'final'
    }
  }
});

// console.log(lightMachine.transition('yellow', { type: 'TIMER' }).value);