### Sequence Diagram

```mermaid
sequenceDiagram
    CC->>+SDK-outboundAPI: Bulk request
    SDK-outboundAPI->>topic-sdk-domain-events: publish name: bulk-request-received content: request payload
    SDK-outboundAPI->>CC: Accepted
    topic-sdk-domain-events->>SDK-ep: consume bulk-request-received
    SDK-ep->>topic-sdk-command-events: publish command: process-bulk-request
    topic-sdk-command-events->>SDK-cp: consume process-bulk-request and update the state
    loop Party Lookup per transfer
        SDK-cp->>topic-sdk-domain-events: query-party-requested
        topic-sdk-domain-events->>SDK-ep: consume query-party-requested
        SDK-ep->>topic-sdk-command-events: publish command: process-query-party-request
        topic-sdk-command-events->>SDK-cp: consume process-query-party-request
        SDK-cp->>SDK-cp: Party lookup with mojaloop and update the state
        SDK-cp->>topic-sdk-domain-events: query-party-request-processed
    end
    topic-sdk-domain-events->>SDK-ep: consume query-party-request-processed (Check the status of the remaining items in the bulk)

    SDK-ep->>topic-sdk-command-events: process-bulk-quotes-request
    topic-sdk-command-events->>SDK-cp: process-bulk-quotes-request: Save the state and de-multiplex
    loop Demultiplex per DFSP (into parts with configurable size)
        SDK-cp->>topic-sdk-domain-events: bulk-quotes-requested
        topic-sdk-domain-events->>SDK-ep: consume bulk-quotes-requested
        SDK-ep->>topic-sdk-command-events: publish command: process-bulk-quotes-request
        topic-sdk-command-events->>SDK-cp: consume process-bulk-quotes-request
        SDK-cp->>SDK-cp: Get Quote with mojaloop and update the state
        SDK-cp->>topic-sdk-domain-events: bulk-quotes-request-processed
    end
    topic-sdk-domain-events->>SDK-ep: consume bulk-quotes-request-processed (Check the status of the remaining items in the bulk)

    SDK-ep->>topic-sdk-command-events: process-bulk-transfers-request
    topic-sdk-command-events->>SDK-cp: process-bulk-transfers-request: Save the state and de-multiplex
    loop Demultiplex per DFSP (into parts with configurable size)
        SDK-cp->>topic-sdk-domain-events: bulk-transfers-requested
        topic-sdk-domain-events->>SDK-ep: consume bulk-transfers-requested
        SDK-ep->>topic-sdk-command-events: publish command: process-bulk-transfers-request
        topic-sdk-command-events->>SDK-cp: consume process-bulk-transfers-request
        SDK-cp->>SDK-cp: Get Quote with mojaloop and update the state
        SDK-cp->>topic-sdk-domain-events: bulk-transfers-request-processed
    end
    topic-sdk-domain-events->>SDK-ep: consume bulk-transfers-request-processed (Check the status of the remaining items in the bulk)
    SDK-ep->>topic-sdk-command-events: process-bulk-multiplex
    topic-sdk-command-events->>SDK-cp: process-bulk-multiplex: Save the state and multiplex
    SDK-cp->>topic-sdk-domain-events: process-bulk-multiplex-completed

    topic-sdk-domain-events->>SDK-outboundAPI: consume process-bulk-multiplex-completed: Send the callback
    SDK-outboundAPI->>CC: Callback
    SDK-outboundAPI->>topic-sdk-domain-events: bulk-callback-sent
```

### References:

https://mojaloop.github.io/reference-architecture-doc/boundedContexts/accountLookupAndDiscovery/

https://github.com/mojaloop/platform-shared-lib/tree/main/modules/nodejs-kafka-client-lib