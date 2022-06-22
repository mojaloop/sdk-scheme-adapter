### Sequence Diagram

```mermaid
sequenceDiagram
    participant CoreConnector as Core Connector
    participant SDKOutboundAPI as SDK Outbound API
    participant SDKEventHandler as SDK Event Handler
    participant SDKCommandHandler as SDK Command Handler
    participant MojaloopSwitch as Mojaloop Switch
    CoreConnector->>+SDKOutboundAPI: BulkRequest
    SDKOutboundAPI->>SDKEventHandler: bulk-request-received
    Note left of SDKEventHandler: topic-sdk-domain-events
    SDKOutboundAPI->>CoreConnector: Accepted
    SDKEventHandler->>SDKCommandHandler: publish command: process-bulk-request
    Note left of SDKCommandHandler: topic-sdk-command-events
    SDKCommandHandler->>SDKCommandHandler: Update the state
    loop Party Lookup per transfer
        SDKCommandHandler->>SDKEventHandler: query-party-requested
        Note right of SDKEventHandler: topic-sdk-domain-events
        SDKEventHandler->>SDKCommandHandler: publish command: process-query-party-request
        Note left of SDKCommandHandler: topic-sdk-command-events
        SDKCommandHandler->>MojaloopSwitch: Party lookup with mojaloop
        MojaloopSwitch->>SDKCommandHandler: Party callback
        SDKCommandHandler->>SDKCommandHandler: Update the state
    end
    SDKCommandHandler->>SDKCommandHandler: check autoAcceptParty
    alt autoAcceptParty == false
        SDKCommandHandler->>CoreConnector: PUT /bulktransfers/{bulkTransferId}
        SDKCommandHandler->>SDKEventHandler: query-party-waiting-for-accept-party
        Note left of SDKCommandHandler: topic-sdk-domain-events

        CoreConnector->>+SDKOutboundAPI: PUT /bulkTransfers/{bulkTransferId}
        SDKOutboundAPI->>SDKEventHandler: accept-party-received
        Note left of SDKEventHandler: topic-sdk-domain-events
        SDKOutboundAPI->>CoreConnector: Accepted
        SDKEventHandler->>SDKCommandHandler: publish command: accept-party-received
        Note left of SDKCommandHandler: topic-sdk-command-events
        loop for each transfer in bulk
            SDKCommandHandler->>SDKCommandHandler: Update the state
        end
        SDKCommandHandler->>SDKEventHandler: query-party-request-processed
        Note left of SDKCommandHandler: topic-sdk-domain-events

    else autoAcceptParty == true
        SDKCommandHandler->>SDKEventHandler: query-party-request-processed
        Note right of SDKEventHandler: topic-sdk-domain-events
    end
    SDKEventHandler->>SDKEventHandler: Check the status of the remaining items in the bulk

    SDKEventHandler->>SDKCommandHandler: process-bulk-quotes-request
    Note left of SDKCommandHandler: topic-sdk-command-events
    SDKCommandHandler->>SDKCommandHandler: Save the state and de-multiplex
    loop Demultiplex per DFSP (into parts with configurable size)
        SDKCommandHandler->>SDKEventHandler: bulk-quotes-requested
        Note right of SDKEventHandler: topic-sdk-domain-events
        SDKEventHandler->>SDKCommandHandler: process-bulk-quotes-request
        Note left of SDKCommandHandler: topic-sdk-command-events
        SDKCommandHandler->>MojaloopSwitch: Get Quote with mojaloop
        MojaloopSwitch->>SDKCommandHandler: Quote callback
        SDKCommandHandler->>SDKCommandHandler: Update the state
    end
    SDKCommandHandler->>SDKCommandHandler: check autoAcceptQuote

    alt autoAcceptQuote == false
        SDKCommandHandler->>CoreConnector: PUT /bulktransfers/{bulkTransferId}
        SDKCommandHandler->>SDKEventHandler: bulk-quotes-request-waiting-for-accept-quote
        Note left of SDKCommandHandler: topic-sdk-domain-events

        CoreConnector->>+SDKOutboundAPI: PUT /bulkTransfers/{bulkTransferId}
        SDKOutboundAPI->>SDKEventHandler: accept-quote-received
        Note left of SDKEventHandler: topic-sdk-domain-events
        SDKOutboundAPI->>CoreConnector: Accepted
        SDKEventHandler->>SDKCommandHandler: publish command: accept-quote-received
        Note left of SDKCommandHandler: topic-sdk-command-events
        loop for each transfer in bulk per DFSP
            SDKCommandHandler->>SDKCommandHandler: Update the state
        end
        SDKCommandHandler->>SDKEventHandler: bulk-quotes-request-processed
        Note left of SDKCommandHandler: topic-sdk-domain-events
    else autoAcceptQuote == true
        SDKCommandHandler->>SDKEventHandler: bulk-quotes-request-processed
        Note right of SDKEventHandler: topic-sdk-domain-events
    end

    SDKEventHandler->>SDKEventHandler: Check the status of the remaining items in the bulk

    SDKEventHandler->>SDKCommandHandler: process-bulk-transfers-request
    Note left of SDKCommandHandler: topic-sdk-command-events
    SDKCommandHandler->>SDKCommandHandler: Update the state
    loop Demultiplex per DFSP (into parts with configurable size)
        SDKCommandHandler->>SDKEventHandler: bulk-transfers-requested
        Note right of SDKEventHandler: topic-sdk-domain-events
        SDKEventHandler->>SDKCommandHandler: process-bulk-transfers-request
        Note left of SDKCommandHandler: topic-sdk-command-events
        SDKCommandHandler->>SDKCommandHandler: Update the state
        SDKCommandHandler->>MojaloopSwitch: Execute Transfers with mojaloop
        MojaloopSwitch->>SDKCommandHandler: Transfers callback
        SDKCommandHandler->>SDKCommandHandler: Update the state
        SDKCommandHandler->>SDKEventHandler: bulk-transfers-request-processed
    end
    Note right of SDKEventHandler: topic-sdk-domain-events
    SDKEventHandler->>SDKEventHandler: Check the status of the remaining items in the bulk
    SDKEventHandler->>SDKCommandHandler: process-bulk-multiplex
    Note left of SDKCommandHandler: topic-sdk-command-events
    SDKCommandHandler->>SDKCommandHandler: Save the state and multiplex
    SDKCommandHandler->>SDKOutboundAPI: process-bulk-multiplex-completed

    Note right of SDKOutboundAPI: topic-sdk-domain-events
    SDKOutboundAPI->>CoreConnector: Send the callback
    SDKOutboundAPI->>SDKEventHandler: bulk-callback-sent
    Note left of SDKEventHandler: topic-sdk-domain-events

```

### References:

https://mojaloop.github.io/reference-architecture-doc/boundedContexts/accountLookupAndDiscovery/

https://github.com/mojaloop/platform-shared-lib/tree/main/modules/nodejs-kafka-client-lib


# Notes

- Define "Update states" clearly
- AutoAccept use cases
- Structure of the redis object that we are storing (HSET <bulkID>?)
- Refer the reference-architecture for the naming and message formats (https://mojaloop.github.io/reference-architecture-doc/boundedContexts/quotingAgreement/)
- Create a story for transforming sdk-scheme-adapter repo as mono repo for both javascript and typescript
- 