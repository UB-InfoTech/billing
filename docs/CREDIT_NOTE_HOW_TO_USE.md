# Credit Note — How to Use

This guide explains the complete Credit Note workflow in the Billing application.

## What a Credit Note does

A Credit Note reduces the value of an existing invoice/order when you need to record a sales return, post-sale discount, invoice correction, service deficiency, POS change, provisional-assessment finalization, or another approved adjustment.

A posted Credit Note is linked to one original invoice and keeps an audit trail. Posted financial values are not edited after posting. To reverse a posted Credit Note, use **Cancel**; the system reverses the invoice adjustment, customer-credit balance, and stock movement where applicable.

## 1. Open Credit Notes

Sign in and open:

**Credit Notes**

The page contains:

- Credit Note list
- Search and filters
- Create Credit Note
- View
- Edit metadata
- Print
- Cancel

## 2. Create a Credit Note

Click:

**+ Create Credit Note**

### Step 1 — Choose the original invoice

In **Original Invoice / Bill**, search using:

- Invoice number
- Customer/company name
- GSTIN

Select the invoice from the search results.

The application loads:

- Invoice number/date
- Customer
- GSTIN
- Invoice total
- Paid amount
- Current due
- Remaining creditable value
- Item-wise remaining creditable quantities

Only invoices belonging to the logged-in user are available.

## 3. Select the Credit Note type

Choose one:

### Item Based

Use this when the credit is tied to specific invoice items or returned quantities.

For each item you can see:

- Invoice quantity
- Previous credit
- Available quantity
- Credit quantity
- Rate
- Discount
- Tax
- Taxable amount
- Credit amount

Enter the quantity to credit. The system does not allow more than the remaining available quantity.

Use:

**Credit All Available**

to credit all remaining quantities.

Use:

**Clear Quantities**

to reset all entered quantities.

### Amount Based

Use this when the adjustment is a value rather than a specific item return.

Enter:

- Taxable Credit Amount
- Tax Rate

The application calculates tax, round-off, and final Credit Note total.

## 4. Select the reason

Available reasons:

- Sales Return
- Post Sale Discount
- Deficiency in Service
- Correction in Invoice
- Change in POS
- Finalization of Provisional Assessment
- Other

Choose the reason that matches your business document.

## 5. Return stock

The **Return Stock** switch is available only for:

**Sales Return + Item Based**

When enabled:

1. The selected product quantities are added back to stock.
2. Inventory movement details are stored on the Credit Note.
3. Cancelling the Credit Note reverses that stock increase.

The system requires product mapping before a stock-return Credit Note can be posted.

## 6. Automatic settlement

Settlement is intentionally kept simple.

The application automatically uses this order:

**Credit Note Total → Invoice Due → Refund Remaining Amount**

Example:

- Credit Note = ₹20,000
- Invoice due = ₹12,000

Result:

- Invoice adjustment = ₹12,000
- Refund = ₹8,000

If the invoice due is greater than the Credit Note total, the complete Credit Note amount is applied against the invoice and refund remains ₹0.

If the invoice has no due amount, the Credit Note total is treated as a refund.

When refund amount is greater than zero, choose a refund method:

- Cash
- Bank Transfer
- UPI
- Cheque

The application requires the full Credit Note amount to be allocated.

## 7. Review the total

Before posting, confirm:

- Subtotal
- Discount
- Taxable amount
- Tax
- Round-off
- Credit Note total
- Invoice adjustment
- Refund

The Credit Note cannot be posted when its value is:

- Zero
- Greater than the remaining creditable invoice value
- Greater than the invoice's current due amount for the adjustment portion
- Above the available quantity for an item
- Partially unallocated

## 8. Add a note

Use the **Note** field for a short business explanation, such as:

> Returned 2 sarees due to quality issue.

Keep internal explanations appropriate for your business records.

## 9. Post the Credit Note

Click:

**Post Credit Note**

The backend validates the invoice, quantities, calculations, settlement, duplicate Credit Note number, stock requirements, and customer-credit rules before saving.

After successful posting, the new Credit Note opens in the preview screen.

## 10. View a Credit Note

From the Credit Note list, click:

**View**

The preview shows:

- Company details
- Credit Note number
- Credit Note date
- Reason
- Customer details
- Original invoice details
- Items
- Taxable amount
- Tax
- Round-off
- Total
- Settlement
- Notes
- Bank details
- Authorized-signatory area

## 11. Print a Credit Note

Open the Credit Note and click:

**Print**

The document uses a print-friendly A4 layout.

From the browser print dialog you can:

- Print on paper
- Save as PDF

For the cleanest output, select the browser's default print margins or the closest available minimal-margin option and keep scaling at the default/100% setting.

The screen-only buttons and page controls are hidden during printing.

Cancelled Credit Notes display a **CANCELLED** watermark on the printed document.

## 12. Edit a Credit Note

For a posted Credit Note, use:

**Edit**

You can edit only safe metadata:

- Credit Note date
- Reason
- Note

The following are locked after posting:

- Original invoice
- Credit quantities
- Credit amount
- Tax calculation
- Total
- Settlement/accounting effects
- Stock movement

This prevents accidental changes to posted financial records.

A Credit Note with a stock return must keep the **Sales Return** reason.

## 13. Cancel a Credit Note

The action is labelled:

**Cancel**

It is intentionally not a hard delete.

When you cancel a posted Credit Note, the application:

1. Marks the Credit Note as **Cancelled**.
2. Reverses the amount applied against the original invoice.
3. Recalculates the invoice due amount.
4. Reverses customer credit when customer credit was used.
5. Reverses inventory movement when stock was returned.
6. Stores cancellation date, user, and cancellation reason.
7. Keeps the original Credit Note for audit history.

Cancellation cannot be undone through the normal Credit Note screen.

## 14. Search and filter Credit Notes

The list supports:

- Credit Note number
- Invoice number
- Customer/company
- GSTIN
- Reason
- Status
- From date
- To date

Status values include:

- Posted
- Cancelled

## 15. Credit Note number

Credit Note numbers are generated by the backend in the format:

`CN-YYYY-00001`

The counter is maintained server-side.

Do not manually reuse an existing Credit Note number.

The application rejects duplicates.

## 16. Important accounting behavior

The Credit Note module keeps these relationships:

**Credit Note → Original Invoice**

and, where applicable:

**Credit Note → Invoice Adjustment**

**Credit Note → Refund**

**Credit Note → Customer Credit**

**Credit Note → Inventory Movement**

The invoice's due balance and credit-applied amount are updated on the server, not trusted from frontend calculations.

## 17. Partial Credit Note example

Invoice:

- Total: ₹50,000
- Already credited: ₹10,000
- Remaining creditable: ₹40,000

You can create another Credit Note up to:

**₹40,000**

If one invoice item had:

- Billed: 10 PCS
- Previously credited: 3 PCS

only:

**7 PCS**

remain available for item-based credit.

## 18. Full credit example

Invoice:

- Total: ₹30,000
- Paid: ₹5,000
- Due: ₹25,000

Create Credit Note:

- Total: ₹30,000

The system can allocate:

- ₹25,000 against invoice due
- ₹5,000 as refund

This is calculated automatically.

## 19. Cancel example

Suppose a posted Credit Note applied:

- ₹10,000 to invoice due
- ₹2,000 as customer credit
- ₹3,000 stock return

Cancelling the Credit Note reverses those effects and leaves the Credit Note itself visible as **Cancelled** for audit.

## 20. Troubleshooting

### Invoice is not appearing in search

Check:

- The invoice belongs to the logged-in account.
- You entered at least two search characters.
- The invoice number/customer/GSTIN matches the stored data.

### No item is available for credit

The item may already be fully credited by previous active Credit Notes.

Open the invoice and check the remaining creditable quantity.

### Credit Note total is larger than allowed

The system compares the new Credit Note against the invoice's remaining creditable amount.

Cancel an incorrect previous Credit Note before creating a replacement when appropriate.

### Stock return is rejected

Check:

- Reason is **Sales Return**
- Credit mode is **Item Based**
- Every selected item has a valid Product mapping
- Product stock field is available

### Refund method is required

A refund method is required whenever refund amount is greater than zero.

### Print output looks different from the preview

Use the browser print dialog and select:

- A4 paper
- Default/normal scale
- Minimal/default margins
- Background graphics when the browser offers that option

## 21. Recommended operating practice

Before posting:

1. Confirm the original invoice.
2. Check the remaining creditable value.
3. Check quantities for item returns.
4. Verify tax and total.
5. Confirm the automatic settlement.
6. Enable stock return only when stock should actually come back.
7. Add a useful note when the reason needs explanation.

After posting:

- Review the preview.
- Print or save the PDF.
- Use **Cancel** rather than trying to remove a financial document.

## 22. Technical notes for developers

Credit Note routes are protected by JWT authentication and scoped to the authenticated user.

The main endpoints are:

`
GET    /api/credit-notes
GET    /api/credit-notes/next-number
GET    /api/credit-notes/invoices/search
GET    /api/credit-notes/available/:orderId
GET    /api/credit-notes/:id
GET    /api/credit-notes/:id/print
POST   /api/credit-notes
PUT    /api/credit-notes/:id
POST   /api/credit-notes/:id/cancel
DELETE /api/credit-notes/:id
`

`DELETE /api/credit-notes/:id` performs the same audit-safe cancellation behavior as the explicit cancel endpoint.

The posting/cancellation code uses MongoDB transactions when the connected deployment supports transactions and falls back to sequential processing on standalone MongoDB so normal local development is not blocked.

Financial totals are calculated and validated on the backend.

## 24. GST document fields used by the print layout

The printable Credit Note includes the core particulars described in Rule 53(1A) of the CGST Rules, including:

- Supplier name, address and GSTIN
- Nature of the document
- Consecutive Credit Note number
- Issue date
- Recipient/customer identity and GSTIN when available
- Corresponding tax invoice number and date
- Taxable value
- Tax rate
- Tax amount
- Authorized-signatory area

These fields are reflected in the server-generated print document. GST law can change and business-specific tax treatment may require professional review before filing or reporting. See the official CBIC references below.

### Official references

- Section 34 of the CGST Act covers circumstances in which a supplier may issue a Credit Note, including excess taxable value/tax, returned goods, and deficient goods or services.
- Rule 53(1A) of the CGST Rules specifies particulars for Credit/Debit Notes.
- The GST Portal documentation explains reporting of Credit/Debit Notes in GSTR-1.

## 23. Quick reference

`
Credit Notes
   ↓
+ Create Credit Note
   ↓
Search Invoice
   ↓
Select Invoice
   ↓
Choose Item Based / Amount Based
   ↓
Enter Credit
   ↓
Review Total
   ↓
Automatic Settlement
   ↓
Post Credit Note
   ↓
View
   ↓
Print / Save PDF

For reversal:
View
   ↓
Cancel
   ↓
Accounting + Stock effects reversed
   ↓
Credit Note remains as Cancelled
`


