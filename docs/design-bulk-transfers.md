### Outbound Sequence Diagram

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

### Outbound Sequence Diagram

```mermaid
sequenceDiagram
    participant MojaloopSwitch as Mojaloop Switch
    participant SDKInboundAPI as SDK Inbound API Payee
    participant SDKEventHandler as SDK Event Handler
    participant SDKCommandHandler as SDK Command Handler
    participant CoreConnector as Core Connector Payee
   
   
    MojaloopSwitch->>+SDKInboundAPI: POST /bulkquotes
    SDKInboundAPI->>SDKEventHandler: bulk-quotes-request-received
    Note left of SDKEventHandler: topic-sdk-in-domain-events
    SDKInboundAPI->>MojaloopSwitch: Accepted
    SDKEventHandler->>SDKCommandHandler: publish command: process-bulk-quotes
    Note left of SDKCommandHandler: topic-sdk-in-command-events
    SDKCommandHandler->>SDKCommandHandler: Update the state
    SDKCommandHandler->>SDKCommandHandler: bulkquotes supported by payee

    alt Bulk quotes supported
        SDKCommandHandler->>SDKEventHandler: bulk-quotes-requested
        Note right of SDKEventHandler: topic-sdk-in-domain-events
        SDKEventHandler->>SDKCommandHandler: publish command: process-bulk-quotes-request
        Note left of SDKCommandHandler: topic-sdk-in-command-events
        SDKCommandHandler->>CoreConnector: POST /bulkquotes
        CoreConnector->>SDKCommandHandler: Response to /bulkquotes
        SDKCommandHandler->>SDKCommandHandler: Update the state
    else Bulk quotes NOT supported
        loop for each transfer in bulk
            SDKCommandHandler->>SDKEventHandler: quote-requested
            Note right of SDKEventHandler: topic-sdk-in-domain-events
            SDKEventHandler->>SDKCommandHandler: publish command: process-quote-request
            Note left of SDKCommandHandler: topic-sdk-in-command-events
            SDKCommandHandler->>CoreConnector: POST /quoterequests
            CoreConnector->>SDKCommandHandler: Response to /quoterequests
            SDKCommandHandler->>SDKCommandHandler: Update the state

        end
    end
    SDKCommandHandler->>MojaloopSwitch: PUT /bulkquotes/{bulkTransferId}
    SDKCommandHandler->>SDKEventHandler: bulk-quotes-processed
    Note right of SDKEventHandler: topic-sdk-in-domain-events
    SDKEventHandler->>SDKEventHandler: Check the status of the remaining items in the bulk

    MojaloopSwitch->>+SDKInboundAPI: POST /bulktransfers
    SDKInboundAPI->>SDKEventHandler: bulk-transfers-request-received
    Note left of SDKEventHandler: topic-sdk-in-domain-events
    SDKInboundAPI->>MojaloopSwitch: Accepted
    SDKEventHandler->>SDKCommandHandler: publish command: process-bulk-transfers
    Note left of SDKCommandHandler: topic-sdk-in-command-events
    SDKCommandHandler->>SDKCommandHandler: Update the state
    SDKCommandHandler->>SDKCommandHandler: bulktransfers supported by payee

    alt Bulk transfers supported
        SDKCommandHandler->>SDKEventHandler: bulk-transfers-requested
        Note right of SDKEventHandler: topic-sdk-in-domain-events
        SDKEventHandler->>SDKCommandHandler: publish command: process-bulk-transfers-request
        Note left of SDKCommandHandler: topic-sdk-in-command-events
        SDKCommandHandler->>CoreConnector: POST /bulktransfers
        CoreConnector->>SDKCommandHandler: Response to /bulktransfers
        SDKCommandHandler->>SDKCommandHandler: Update the state
    else Bulk transfers NOT supported
        loop for each transfer in bulk
            SDKCommandHandler->>SDKEventHandler: transfer-requested
            Note right of SDKEventHandler: topic-sdk-in-domain-events
            SDKEventHandler->>SDKCommandHandler: publish command: process-transfer-request
            Note left of SDKCommandHandler: topic-sdk-in-command-events
            SDKCommandHandler->>CoreConnector: POST /transfers
            CoreConnector->>SDKCommandHandler: Response to /transfers
            SDKCommandHandler->>SDKCommandHandler: Update the state

        end
    end
    SDKCommandHandler->>MojaloopSwitch: PUT /bulktransfers/{bulkTransferId}
    SDKCommandHandler->>SDKEventHandler: bulk-transfers-processed
    Note right of SDKEventHandler: topic-sdk-in-domain-events
    SDKEventHandler->>SDKEventHandler: Check the status of the remaining items in the bulk

    alt bulkStatus == 'ACCEPTED'
        MojaloopSwitch->>+SDKInboundAPI: PATCH /bulktransfers/{bulkTransferId}
        SDKInboundAPI->>SDKEventHandler: bulk-transfers-patch-received
        Note left of SDKEventHandler: topic-sdk-in-domain-events
        SDKInboundAPI->>MojaloopSwitch: Accepted
        alt Bulk transfers supported
            SDKCommandHandler->>SDKEventHandler: bulk-transfers-patch-requested
            Note right of SDKEventHandler: topic-sdk-in-domain-events
            SDKEventHandler->>SDKCommandHandler: publish command: process-bulk-transfers-patch-request
            Note left of SDKCommandHandler: topic-sdk-in-command-events
            SDKCommandHandler->>CoreConnector: PATCH /bulktransfers/{bulkTransferId}
            CoreConnector->>SDKCommandHandler: Response to /bulktransfers/{bulkTransferId}
            SDKCommandHandler->>SDKCommandHandler: Update the state
        else Bulk transfers NOT supported
            loop for each transfer in bulk
                SDKCommandHandler->>SDKEventHandler: transfer-patch-requested
                Note right of SDKEventHandler: topic-sdk-in-domain-events
                SDKEventHandler->>SDKCommandHandler: publish command: process-transfer-patch-request
                Note left of SDKCommandHandler: topic-sdk-in-command-events
                SDKCommandHandler->>CoreConnector: PATCH /transfers/{transferId}
                CoreConnector->>SDKCommandHandler: Response to /transfers/{transferId}
                SDKCommandHandler->>SDKCommandHandler: Update the state

            end
        end
        SDKCommandHandler->>MojaloopSwitch: PUT /bulktransfers/{bulkTransferId}
        SDKCommandHandler->>SDKEventHandler: bulk-transfers-processed
        Note right of SDKEventHandler: topic-sdk-in-domain-events
        SDKEventHandler->>SDKEventHandler: Check the status of the remaining items in the bulk

    end
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