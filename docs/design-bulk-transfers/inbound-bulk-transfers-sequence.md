### Inbound Sequence Diagram

```mermaid
sequenceDiagram
    participant MojaloopSwitch as Mojaloop Switch
    participant SDKFspiopApi as SDK FSPIOP API
    participant SDKInboundDomainEventHandler as SDK Inbound Domain Event Handler
    participant SDKInboundCommandEventHandler as SDK Inbound Command Event Handler
    participant SDKBackendApi as SDK Backend API
    participant CoreConnector as Core Connector Payee

    MojaloopSwitch->>+SDKFspiopApi: POST /bulkTransfers
    SDKFspiopApi->>SDKFspiopApi: Process Trace Headers
    SDKFspiopApi->>SDKInboundDomainEventHandler: InboundBulkTransfersRequestReceived
    Note left of SDKInboundDomainEventHandler: topic-sdk-inbound-domain-events
    SDKFspiopApi-->>MojaloopSwitch: Accepted
    SDKInboundDomainEventHandler->>SDKInboundCommandEventHandler: ProcessInboundBulkTransfersRequest
    Note left of SDKInboundCommandEventHandler: topic-sdk-inbound-command-events
    SDKInboundCommandEventHandler->>SDKInboundCommandEventHandler: Update the bulk state: RECEIVED
    SDKInboundCommandEventHandler->>SDKInboundCommandEventHandler: Check if bulkQuotes supported by payee

    alt Bulk transfers supported
        SDKInboundCommandEventHandler->>SDKBackendApi: SDKBulkTransfersRequested
        Note left of SDKBackendApi: topic-sdk-inbound-domain-events
        SDKInboundCommandEventHandler->>SDKInboundCommandEventHandler: Update the bulk state: PROCESSING
        SDKBackendApi->>SDKBackendApi: Process outbound Trace Headers
        SDKBackendApi->>CoreConnector: POST /bulkTransfers
        CoreConnector-->>SDKBackendApi: Accepted
        CoreConnector->>SDKBackendApi: PUT /bulkTransfers
        SDKBackendApi->>SDKBackendApi: Process inbound Trace Headers
        SDKBackendApi->>SDKInboundDomainEventHandler: SDKBulkTransfersCallbackReceived
        Note right of SDKInboundDomainEventHandler: topic-sdk-inbound-domain-events
        SDKBackendApi-->>CoreConnector: Accepted
    else Bulk transfers NOT supported
        loop for each transfer in bulk
            SDKInboundCommandEventHandler->>SDKBackendApi: TransferRequested
            Note left of SDKBackendApi: topic-sdk-inbound-domain-events
            SDKInboundCommandEventHandler->>SDKInboundCommandEventHandler: Update the individual state: TRANSFERS_PROCESSING
            SDKBackendApi->>SDKBackendApi: Process outbound Trace Headers
            SDKBackendApi->>CoreConnector: POST /transfers
            CoreConnector-->>SDKBackendApi: Synchronous Response
            SDKBackendApi->>SDKBackendApi: Process Inbound Trace Headers
            SDKBackendApi->>SDKInboundDomainEventHandler: TransfersCallbackReceived
            Note right of SDKInboundDomainEventHandler: topic-sdk-inbound-domain-events
            SDKInboundDomainEventHandler->>SDKInboundCommandEventHandler: ProcessTransfersCallback
            Note left of SDKInboundCommandEventHandler: topic-sdk-command-events
            SDKInboundCommandEventHandler->>SDKInboundCommandEventHandler: Update the individual state: TRANSFERS_SUCCESS / TRANSFERS_FAILED
            SDKInboundCommandEventHandler->>SDKInboundDomainEventHandler: TransfersCallbackProcessed
            Note right of SDKInboundDomainEventHandler: topic-sdk-domain-events
            SDKInboundDomainEventHandler->>SDKInboundDomainEventHandler: Check the status of the remaining items in the bulk
        end
    end
    SDKInboundDomainEventHandler->>SDKInboundCommandEventHandler: ProcessInboundBulkTransfersRequestComplete
    Note left of SDKInboundCommandEventHandler: topic-sdk-inbound-command-events
    SDKInboundCommandEventHandler->>SDKInboundCommandEventHandler: Update the bulk state: COMPLETED?
    SDKInboundCommandEventHandler->>SDKFspiopApi: InboundBulkTransfersRequestProcessed
    Note right of SDKFspiopApi: topic-sdk-inbound-domain-events
    SDKInboundCommandEventHandler->>SDKInboundCommandEventHandler: Update the bulk state: RESPONSE_PROCESSING
    SDKFspiopApi->>SDKFspiopApi: Process Outbound Trace Headers
    SDKFspiopApi->>MojaloopSwitch: PUT /bulkTransfers/{bulkTransferId}
    MojaloopSwitch-->>SDKFspiopApi: Accepted
    SDKFspiopApi->>SDKInboundDomainEventHandler: InboundBulkTransfersResponseSent
    Note left of SDKInboundDomainEventHandler: topic-sdk-domain-events
    SDKInboundDomainEventHandler->>SDKInboundCommandEventHandler: ProcessInboundBulkTransfersResponseSent
    Note left of SDKInboundCommandEventHandler: topic-sdk-inbound-command-events
    SDKInboundCommandEventHandler->>SDKInboundCommandEventHandler: Update bulk state "RESPONSE_SENT"


    MojaloopSwitch->>MojaloopSwitch: Check bulkStatus

    alt bulkStatus == 'ACCEPTED'
        MojaloopSwitch->>+SDKFspiopApi: PATCH /bulkTransfers/{bulkTransferId}
        SDKFspiopApi-->>MojaloopSwitch: Accepted
        SDKFspiopApi->>SDKFspiopApi: Process Trace Headers
        SDKFspiopApi->>SDKInboundDomainEventHandler: InboundBulkTransfersPatchRequestReceived
        Note left of SDKInboundDomainEventHandler: topic-sdk-inbound-domain-events
        SDKFspiopApi-->>MojaloopSwitch: Accepted
        SDKInboundDomainEventHandler->>SDKInboundCommandEventHandler: ProcessInboundBulkTransfersPatchRequest
        Note left of SDKInboundCommandEventHandler: topic-sdk-inbound-command-events
        SDKInboundCommandEventHandler->>SDKInboundCommandEventHandler: Update the bulk state: PATCH_RECEIVED
        SDKInboundCommandEventHandler->>SDKInboundCommandEventHandler: Check if bulkTransfers supported by payee
        alt Bulk transfers supported
            SDKInboundCommandEventHandler->>SDKBackendApi: SDKBulkTransfersPatchRequested
            Note left of SDKBackendApi: topic-sdk-inbound-domain-events
            SDKInboundCommandEventHandler->>SDKInboundCommandEventHandler: Update the bulk state: PATCH_PROCESSING
            SDKBackendApi->>SDKBackendApi: Process outbound Trace Headers
            SDKBackendApi->>CoreConnector: PATCH /bulkTransfers/{bulkTransferId}
            CoreConnector-->>SDKBackendApi: Accepted
            CoreConnector->>SDKBackendApi: Response to Patch /bulkTransfers
            SDKBackendApi->>SDKBackendApi: Process inbound Trace Headers
            SDKBackendApi->>SDKInboundDomainEventHandler: SDKBulkTransfersPatchCallbackReceived
            Note right of SDKInboundDomainEventHandler: topic-sdk-inbound-domain-events
            SDKBackendApi-->>CoreConnector: Accepted
        else Bulk transfers NOT supported
            loop for each transfer in bulk
              SDKInboundCommandEventHandler->>SDKBackendApi: TransfersPatchRequested
              Note left of SDKBackendApi: topic-sdk-inbound-domain-events
              SDKInboundCommandEventHandler->>SDKInboundCommandEventHandler: Update the individual state: TRANSFERS_PATCH_PROCESSING
              SDKBackendApi->>SDKBackendApi: Process outbound Trace Headers
              SDKBackendApi->>CoreConnector: PATCH /transfers/{transferId}
              CoreConnector-->>SDKBackendApi: Accepted
              SDKBackendApi->>SDKBackendApi: Process Inbound Trace Headers
              SDKBackendApi->>SDKInboundDomainEventHandler: TransfersPatchCallbackReceived
              Note right of SDKInboundDomainEventHandler: topic-sdk-inbound-domain-events
              SDKBackendApi-->>CoreConnector: Accepted
              SDKInboundDomainEventHandler->>SDKInboundCommandEventHandler: ProcessTransfersPatchCallback
              Note left of SDKInboundCommandEventHandler: topic-sdk-command-events
              SDKInboundCommandEventHandler->>SDKInboundCommandEventHandler: Update the individual state: TRANSFERS_PATCH_SUCCESS / TRANSFERS_PATCH_FAILED
              SDKInboundCommandEventHandler->>SDKInboundDomainEventHandler: TransfersPatchCallbackProcessed
              Note right of SDKInboundDomainEventHandler: topic-sdk-domain-events
              SDKInboundDomainEventHandler->>SDKInboundDomainEventHandler: Check the status of the remaining items in the bulk
            end
        end

        SDKInboundDomainEventHandler->>SDKInboundCommandEventHandler: ProcessInboundBulkTransfersPatchRequestComplete
        Note left of SDKInboundCommandEventHandler: topic-sdk-inbound-command-events
        SDKInboundCommandEventHandler->>SDKInboundCommandEventHandler: Update the bulk state: COMPLETED
        SDKInboundCommandEventHandler->>SDKFspiopApi: InboundBulkTransfersPatchRequestProcessed
        Note right of SDKFspiopApi: topic-sdk-inbound-domain-events
        SDKInboundCommandEventHandler->>SDKInboundCommandEventHandler: Update the bulk state: RESPONSE_PROCESSING
        SDKFspiopApi->>SDKFspiopApi: Process Outbound Trace Headers
        SDKFspiopApi->>MojaloopSwitch: PUT /bulkTransfers/{bulkTransferId}
        MojaloopSwitch-->>SDKFspiopApi: Accepted
        SDKFspiopApi->>SDKInboundDomainEventHandler: InboundBulkTransfersPatchResponseSent
        Note left of SDKInboundDomainEventHandler: topic-sdk-inbound-domain-events
        SDKInboundDomainEventHandler->>SDKInboundCommandEventHandler: ProcessInboundBulkTransfersPatchResponseSent
        Note left of SDKInboundCommandEventHandler: topic-sdk-inbound-command-events
        SDKInboundCommandEventHandler->>SDKInboundCommandEventHandler: Update bulk state "PATCH_RESPONSE_SENT"
    end
```
