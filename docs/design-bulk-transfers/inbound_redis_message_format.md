# Redis message format for inbound bulk transfer

## 1. Bulk Quotes

### Command:
```
HSET <key> <attribute1> <value1>
```
### Key:
```
inboundBulkQuotes_< bulkQuotesId >
```

### Attributes:
- **bulkQuotesId**: bulkQuotesId

- **individualItem_< quotesId >**: Serialize ({
  id: quotesId
  request: {}
  state: Individual state
  quotesRequest: {}
  quotesResponse: {}
  lastError: {}
})

- **state**: Global state
  - RECEIVED
  - PROCESSING

- **bulkQuotesTotalCount**: Total number of bulk quotes requests
- **bulkQuotesSuccessCount**: Total number of quotes requests those are succeeded
- **bulkQuotesFailedCount**: Total number of quotes requests those are failed


### Notes
- Kafka messages should contain bulkQuotesId.
- To update the global state use the command `HSET bulkQuotes_< bulkQuotesId > state < stateValue >`

## 2. Bulk Transfers

### Command:
```
HSET <key> <attribute1> <value1>
```
### Key:
```
inboundBulkTransfer_< bulkTransferId >
```

### Attributes:
- **bulkTransferId**: bulkTransferId

- **individualItem_< transferId >**: Serialize ({
  id: transferId
  request: {}
  state: Individual state
  transfersRequest: {}
  transfersResponse: {}
  lastError: {}
})

- **state**: Global state
  - RECEIVED
  - PROCESSING

- **bulkTransferTotalCount**: Total number of bulk transfers requests
- **bulkTransferSuccessCount**: Total number of transfers requests those are succeeded
- **bulkTransferFailedCount**: Total number of transfers requests those are failed


### Notes
- Kafka messages should contain bulkTransferId.
- To update the global state use the command `HSET bulkTransfer_< bulkTransferId > state < stateValue >`


## 3. For mapping individual callbacks with individual bulk items

### Command:
```
HSET inboundBulkCorrelationMap <attribute1> <value1>
```

### Attributes:
- quotes_`<quoteId>`: "{ bulkQuoteId: `<bulkQuoteId>` }"
- transfers_`<transferId>`: "{ bulkTransferId: `<bulkTransferId>`, bulkQuoteId: `<bulkQuoteId>` }"


Notes:
- We can use `HKEYS` command to fetch all the individual transfer IDs in a bulk to iterate