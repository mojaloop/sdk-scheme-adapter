# Redis message formats

## 1. States (Global and individual)

### Command:
```
HSET <key> <attribute1> <value1>
```
### Key:
```
**bulkTransaction_< bulkTransactionId >**
```

### Attributes:
- **bulkTransactionId**: bulkTransactionId
- **bulkHomeTransactionID**: Home transaction ID
- **request**: {
  options: Options,
  extensionList: Bulk Extension List
}

- **individualtransfers_<transactionId>**: Serialize ({
  id: transactionId
  request: {}
  state: Individual state
  batchId: <UUID>
  partyRequest: {}
  quotesRequest: {}
  transfersRequest: {}
  partyResponse: {}
  quotesResponse: {}
  transfersResponse: {}
  lastError: {}
  acceptParty: bool
  acceptQuotes: bool
})

- **status**: Global state
  - RECEIVED
  - DISCOVERY_PROCESSING

- **bulkBatch_< batchId >**: Serialize ({
  id: batchId
  status: Individual state
  - AGREEMENT_PROCESSING
  - TRANSFER_PROCESSING
  bulkQuoteId: <UUID>
  bulkTransferId: <UUID> (Can be batchId)
})

- **partyLookupTotalCount**: Total number of party lookup requests
- **partyLookupSuccessCount**: Total number of party lookup requests those are succeeded
- **partyLookupFailedCount**: Total number of party lookup requests those are failed

- **bulkQuotesTotalCount**: Total number of bulk quotes requests
- **bulkQuotesSuccessCount**: Total number of quotes requests those are succeeded
- **bulkQuotesFailedCount**: Total number of quotes requests those are failed

- **bulkTransfersTotalCount**: Total number of bulk transfers requests
- **bulkTransfersSuccessCount**: Total number of bulk transfers requests those are succeeded
- **bulkTransfersFailedCount**: Total number of bulk transfers requests those are failed


### Notes
- Kafka messages should contain bulkID.
- To update the global status use the command `HSET bulkTransaction_< bulkTransactionId > status < statusValue >`
<!-- - To update individual status use `HSET bulkTransfer_< bulkId > partyLookupStatus_< partyLookupID > < statusValue >` -->


## 2. For mapping individual callbacks with individual bulk items

### Command:
```
HSET bulkCorrelationMap <attribute1> <value1>
```

### Attributes:
- partyLookup_<id_type>_<id_value>(_<subid_type>): "{ bulkTransactionId: <bulkTransactionId>, transactionId: <transactionId> }"
- bulkQuotes_<bulkQuoteId>: "{ bulkTransactionId: <bulkTransactionId>, batchId: <batchId> }"
- bulkTransfers_<bulkTransferId>: "{ bulkTransactionId: <bulkTransactionId>, batchId: <batchId>, bulkQuoteId: <bulkQuoteId> }"
- bulkHomeTransactionId_<bulkHomeTransactionId>: "{ bulkTransactionId: <bulkTransactionId> }"

