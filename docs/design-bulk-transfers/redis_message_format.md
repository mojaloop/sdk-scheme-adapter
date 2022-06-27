# Redis message formats

## 1. States (Global and individual)

### Command:
```
HSET <key> <attribute1> <value1>
```
### Key:
```
**bulkTransfer_< bulkId >**
```

### Attributes:
- **originalRequest**: Serialized request object
- **status**: Global state
  - RECEIVED
  - DISCOVERY_PROCESSING
- **individualTransfer_<transactionId>**: TBD
- **partyLookupTotalCount**: Total number of party lookup requests
- **partyLookupSuccessCount**: Total number of party lookup requests those are succeeded
- **partyLookupFailedCount**: Total number of party lookup requests those are failed
- **partyLookupStatus_< partyLookupID >**: Individual state
  - PROCESSING
- **bulkQuotesTotalCount**: Total number of bulk quotes requests
- **bulkQuotesSuccessCount**: Total number of quotes requests those are succeeded
- **bulkQuotesFailedCount**: Total number of quotes requests those are failed
- **bulkQuotesStatus_< bulkQuotesID >**: Individual state
  - PROCESSING
- **bulkTransfersTotalCount**: Total number of bulk transfers requests
- **bulkTransfersSuccessCount**: Total number of bulk transfers requests those are succeeded
- **bulkTransfersFailedCount**: Total number of bulk transfers requests those are failed
- **bulkTransfersStatus_< bulkTransfersID >**: Individual state
  - PROCESSING

### Notes
- Kafka messages should contain bulkID.
- To update the global status use the command `HSET bulkTransfer_< bulkId > status < statusValue >`
- To update individual status use `HSET bulkTransfer_< bulkId > partyLookupStatus_< partyLookupID > < statusValue >`


## 2. Whole bulkTransfer request (For multiplexing and de-multiplexing)
- option1: Flatten the request and store in a separate HSET
- option2: Serialize the request object and store as a string in the same HSET

## 3. For mapping individual callbacks with individual bulk items

### Command:
```
HSET bulkCorrelationMap <attribute1> <value1>
```

### Attributes:
- partyLookup_<id_type>_<id_value>(_<subid_type>): "{ bulkHomeTransactionID: <bulkHomeTransactionID>, transactionId: <transactionId> }"
- bulkQuotes_<bulkQuoteId>: "{ bulkHomeTransactionID: <bulkHomeTransactionID>, bulkTransferId: <bulkTransferId> }"
- bulkTransfers_<bulkTransfersId>: "{ bulkHomeTransactionID: <bulkHomeTransactionID>, bulkTransfersId: <bulkTransfersId>, bulkQuoteId: <bulkQuoteId> }"

