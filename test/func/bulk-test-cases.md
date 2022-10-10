## Happy Path: (bulk-happy-path.json)
 - 1 transfer with acceptParty and acceptQuote set to true
 - Bulk transaction having a format error

## Parties Errors: (bulk-parties-error-cases.json)
 - 1 transfer in the request
   - Receiver sends error for in parties response
   - Senderfsp sends acceptParty: false 
 - 2 transfers in the request
   - Receiver sends an error response for one of the transfers
   - Receiver times out sending response for one of the transfers
   - Do not get any response from the receiver for both the transfers


## Quotes Errors: (bulk-quotes-error-cases.json)
 - 2 transfers having the same receiver fsp id
   - acceptParty
     - All true
       - TC-BQ1 - Receiver fsp fails the entire batch - Bug 2946
       - TC-BQ2 - Receiver fsp times out the entire batch
       - TC-BQ3 - Receiver fsp sends only one response and skips the other
       - TC-BQ4 - Receiver fsp sends one success response and one failure response - failing in payeefsp because of missing transfer, but is this something we need to worry about?
    - TC-BQ5 - One true, one false - not getting final transfers response in TTK - PASS
    - TC-BQ6 - All false - what should be the expected behavior?
    - TC-BQ7 - True is sent only for one quote in PUT /bulkTxn acceptParty, ignoring second one - PASS
    - TC-BQ8- false is sent only for one quote in PUT /bulkTxn acceptParty, ignoring second one - what should be the expected behavior?
 - 2 transfers having different receiver fsp ids
   - acceptParty
     - All true
       - TC-BQ9 - One batch sends an error - FAIL - no final PUT response
       - TC-BQ10- Both batches sends error - FAIL - no final PUT response
       - TC-BQ11 - One batch times out
       - TC-BQ12 - Both batches times out
 - 3 transfers with 2 transfers having 1 receiver fsp id and the other having a different one
   - The batch with 2 transfers sends only 1 transfer response and the other batch sends the success response
			
				
## Transfers Errors: (bulk-transfer-errors.json)
 - One bulkTransfer with 2 transfers
  - acceptQuote
     - All true 
       - TC-BT1 - Receiver fails the entire batch - Bug 2972. Also TTK rule for bulkQuotes not working as expected
       - TC-BT2 - Receiver times out for the entire batch
       - TC-BT3 - Receiver fsp sends only one response and skips the other
       - TC-BT4 - Receiver fsp sends one success response and one failure  - Bug 2974 Also TTK rule for bulkQuotes not working as expected
    - TC-BT5 - One true one false - TC2 - Bug 2958
    - TC-BT6 - All false - TC1
    - TC-BT7 - True is sent only for one transfer in PUT /bulkTxn acceptParty, ignoring second one working
    - TC-BT8- false is sent only for one transfer in PUT /bulkTxn acceptParty, ignoring second one
