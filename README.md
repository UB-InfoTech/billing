# Billing & CRM Platform

A full-stack billing, CRM, order management, inventory, payment, GST, reporting, and business operations platform built with **React + Vite** on the frontend and **Node.js + Express + MongoDB/Mongoose** on the backend.

The application is designed for small and growing businesses that need a single system for customer management, sales, invoices, payments, inventory, expenses, reports, calendar events, and compliance-related workflows.

## Core Modules

### 🔐 Authentication & User Access

- User registration and login
- JWT-based authentication
- Protected frontend routes
- Authenticated API access using `x-auth-token`
- User-linked record creation through `createdBy`
- Profile management
- Token validation and expiry handling

### 👥 Client Management / CRM

- Client CRUD management
- Customer personal and business information
- Company name, GSTIN, address, state, city, PIN code, and state code
- Business type classification
- Account status management
- Order and revenue statistics
- Payment and pending-payment information
- Customer notes
- Customer analytics fields such as:
  - Order count
  - Total revenue
  - Last order date
  - Average order value
  - Preferred products
  - Discount rate
  - Payment terms

### 🧾 Sales & Order Management

The order module is the central sales workflow.

#### Invoice / Order Features

- Invoice/order number management
- Challan number
- LR number
- Order date
- Customer selection
- GST details
- Address and state information
- Order status workflow:
  - Pending
  - In Process
  - Completed
  - Cancelled
  - Dispatched
- Persistent status history
- Payment terms:
  - 30 days
  - 60 days
  - 90 days
  - Advance

#### Multiple Line Items

Each invoice can contain multiple sub-orders/items with:

- Design number
- Order/item name
- HSN code
- Quantity unit
- Quantity
- Meter quantity
- Cut
- Short pieces
- Unit price

#### Automatic Financial Calculation

- Base amount calculation
- Discount percentage and amount
- Tax percentage and tax amount
- Final invoice revenue
- Round-off amount
- Paid amount
- Due amount
- Payment status
- Profit-related values

The backend recalculates financial values when orders are saved or updated so invoice totals do not depend only on frontend calculations.

### 💳 Payment Management

- Multiple manual payments per invoice
- Payment date
- Payment method:
  - Cash
  - Bank Transfer
  - UPI
  - Cheque
- Payment reference
- Add payment
- Edit payment
- Payment history
- Payment totals
- Payment status tracking
- Receipt printing
- Invoice/payment workflow integration

No online payment gateway is required for the manual payment workflow.

### 📝 Credit Note Management

Credit Notes are linked directly to the original invoice/order.

#### Credit Note Features

- Credit Note number generation
- Credit Note date
- Original invoice selection
- Invoice/customer/GST search
- Automatic loading of invoice items
- Remaining creditable quantity calculation
- Previously credited quantity tracking
- Partial credit notes
- Full credit notes
- Item-wise credit quantity
- MTR and PCS handling
- Original item rate reuse
- Discount calculation
- GST/tax calculation
- Taxable amount
- Tax amount
- Round-off
- Grand total
- Settlement allocation

#### Credit Note Reasons

- Sales Return
- Post Sale Discount
- Deficiency in Service
- Correction in Invoice
- Change in POS
- Finalization of Provisional Assessment
- Other

#### Settlement

A credit note can be allocated through:

- Adjustment against outstanding invoice due
- Refund
- Customer credit
- Refund method:
  - Cash
  - Bank Transfer
  - UPI
  - Cheque

#### Credit Note Controls

- Prevent crediting more quantity than originally billed
- Prevent crediting already-credited quantity
- Prevent credit amount above remaining invoice value
- Validate settlement allocation
- Prevent invalid refund methods
- Prevent duplicate Credit Note numbers
- Immutable posted Credit Notes
- Cancellation instead of deletion
- Cancellation audit information
- Invoice balance reversal after cancellation
- Credit-note count tracking
- Transaction-based posting/cancellation when MongoDB transactions are available

#### Inventory Return Support

Sales Return Credit Notes can support inventory reversal.

- Increase product stock on return
- Store inventory movement details
- Validate product mapping
- Reverse inventory movement when the Credit Note is cancelled
- Prevent invalid negative stock reversal

### 📦 Product & Inventory

- Product master
- Product name
- Product code
- Description
- Selling rate
- Quantity/stock
- Serial number
- Design number
- Product images
- Barcode value
- Product creation tracking
- Inventory quantity updates
- Product lookup for stock-related workflows

### 🧮 Expense Management

- Create expenses
- Expense editing
- Expense listing
- Expense categories/details
- Expense date
- Expense amount
- Expense descriptions
- Expense management workflow
- Integration point for expense and profit reporting

### 📊 Sales Analytics & Business Reports

The platform includes reporting/analytics capabilities for business performance.

#### Sales & Revenue Analytics

- Total revenue
- Growth calculations
- Order count
- Daily trends
- Weekly trends
- Monthly trends
- Yearly trends
- Client-wise revenue
- Top products/items
- Design-related analysis
- Revenue summaries
- Visual charts and dashboards

#### Additional Reporting Areas

- Order efficiency
- Machine/business performance data
- Supplier analysis
- Expense vs profit analysis
- Operational insights
- Exportable reporting workflows

### 📅 Calendar & Events

- Business event calendar
- Create/update/delete events
- Calendar-based scheduling
- Event date/time handling
- Event descriptions
- FullCalendar-based interface
- Business activity planning

### 🏷️ GST & Tax Workflows

- GSTIN storage on customers/orders
- State and state-code information
- HSN code support
- Invoice tax percentage
- Credit Note tax calculation
- Tax amount tracking
- Taxable value tracking
- Round-off handling
- GST detail lookup integration endpoint

### 🚚 E-Way Bill

The application contains an E-Way Bill integration workflow.

- E-Way Bill details on orders
- E-Way Bill number
- E-Way Bill date
- Valid-till information
- E-Way Bill status
- Alert information
- E-Way Bill generation workflow
- E-Way Bill PDF/download workflow
- External GST/E-Way Bill service integration support

### 📄 Invoice, Receipt & Document Printing

- Printable invoice workflow
- Printable payment receipts
- Printable Credit Notes
- Browser print support
- PDF generation support on backend
- EJS/html-based document generation support
- A4-oriented business document workflows

### 📤 Import / Export

The frontend includes support for data/document workflows such as:

- Excel/XLSX export and processing
- File download utilities
- Printable business reports
- PDF-related workflows

### 🔔 Notifications & Communication Infrastructure

Backend dependencies and services support:

- Email sending
- Automated notification workflows
- Reminder-oriented infrastructure
- SMTP/Nodemailer integration

### 📱 Responsive UI

The frontend is built as a responsive business application with:

- Bootstrap 5
- Responsive tables
- Responsive forms
- Responsive dashboards
- Mobile-friendly modals
- Print-friendly layouts
- Bootstrap Icons

## Credit Note Workflow

Typical Credit Note flow:

```text
Select Invoice
      ↓
Load Original Invoice
      ↓
Load Item-wise Available Credit
      ↓
Enter Returned / Credited Quantity
      ↓
Calculate Discount + GST
      ↓
Calculate Credit Note Total
      ↓
Allocate Credit
   ┌───────────────┬──────────────┐
   ↓               ↓              ↓
Adjust Due       Refund       Customer Credit
   ↓               ↓              ↓
            Post Credit Note
                  ↓
          Update Invoice Balance
                  ↓
          Optional Stock Return
                  ↓
             Print / Audit
```

## Technology Stack

### Frontend

- React 19
- Vite
- React Router
- Axios
- Bootstrap 5
- Bootstrap Icons
- Chart.js
- React Chart.js 2
- FullCalendar
- React-to-Print
- React Date Picker
- React Toastify
- XLSX
- File Saver
- Yup
- HTML5 QR Code

### Backend

- Node.js
- Express 5
- MongoDB
- Mongoose
- JWT
- bcrypt / bcryptjs
- Axios
- Multer
- Nodemailer
- EJS
- html-pdf
- bwip-js
- Express Validator
- Express Rate Limit
- Mongo Sanitize
- dotenv
- Moment

## Architecture Notes

- Backend business logic is implemented directly in the active route modules; the legacy `backend/controllers` folder has been removed.
- Frontend navigation is defined directly in `App.jsx`; the legacy `frontend/src/routes` folder has been removed.
- All business APIs are authenticated and scoped to the logged-in user where applicable.
- Financial values such as invoice totals, payments, due balances, Credit Note adjustments, and inventory changes are recalculated/validated on the server.
- Posted Credit Notes are audit-preserving documents and are cancelled rather than deleted.
- Credit Note posting/cancellation uses MongoDB transactions and therefore requires a replica-set/Atlas deployment.
- API rate limiting and MongoDB query sanitization are enabled in the server.

## Project Structure

```text
billing/
├── backend/
│   ├── config/
│   ├── controllers/
│   ├── middleware/
│   ├── models/
│   ├── routes/
│   ├── services/
│   ├── reports/
│   ├── public/
│   ├── utils/
│   ├── server.js
│   ├── package.json
│   └── .env
│
└── frontend/
    ├── src/
    │   ├── assets/
    │   ├── components/
    │   ├── pages/
    │   ├── routes/
    │   ├── services/
    │   ├── Data/
    │   ├── App.jsx
    │   ├── Layout.jsx
    │   └── main.jsx
    ├── package.json
    ├── vite.config.js
    └── index.html
```

## Main Frontend Pages

- Login
- Register
- Dashboard/Home
- Clients
- Orders
- Credit Notes
- Bulk Payments
- Expenses
- Add Expense
- Products
- Calendar
- Sales Analytics
- Profile

## Main Backend Models

- User
- Client
- Order2
- PaymentLog2
- Product
- Expense
- CreditNote
- CreditNoteCounter
- EwayAuthToken
- Calendar
- Machine
- Supplier
- Profile
- Note

## Main API Areas

The backend exposes REST API groups including:

```text
/api/auth
/api/clients
/api/order
/api/events
/api/expenses
/api/products
/api/profile
/api/ewaybill
/api/gstdetails
/api/payments
/api/credit-notes
```

## Credit Note API

The Credit Note module provides endpoints for:

```text
GET    /api/credit-notes
GET    /api/credit-notes/next-number
GET    /api/credit-notes/invoices/search
GET    /api/credit-notes/available/:orderId
GET    /api/credit-notes/:id
POST   /api/credit-notes
POST   /api/credit-notes/:id/cancel
DELETE /api/credit-notes/:id   (blocked for posted notes)
```

## Security

- JWT authentication
- Protected API endpoints
- Protected frontend routes
- Password hashing
- Input validation support
- Rate-limiting support
- MongoDB query sanitization support
- Authenticated record ownership through user references
- Immutable posted Credit Notes with cancellation-based audit trail

## Business Data Integrity

The application contains several backend-side safeguards:

- Server-side invoice calculations
- Server-side Credit Note calculations
- Duplicate document number prevention
- Quantity validation
- Credit-limit validation
- Settlement validation
- Payment and due calculations
- Transaction-based Credit Note posting
- Transaction-based Credit Note cancellation
- Inventory reversal support
- Audit-friendly cancellation instead of deletion

## Installation

### 1. Clone Repository

```bash
git clone https://github.com/UB-InfoTech/billing.git
cd billing
```

### 2. Backend Setup

```bash
cd backend
npm install
```

Create `.env` from the committed `backend/.env.example` and set the real values for MongoDB, JWT, TaxPro, and email services. Secrets are intentionally not stored in Git.

Start backend:

```bash
npm run dev
```

Production:

```bash
npm start
```

### 3. Frontend Setup

```bash
cd frontend
npm install
```

Optional environment variable:

```env
VITE_API_URL=http://localhost:5000
```

Start frontend:

```bash
npm run dev
```

Production build:

```bash
npm run build
```

Preview production build:

```bash
npm run preview
```

## Environment Requirements

Recommended development environment:

- Node.js 18+ / current LTS
- MongoDB 6+
- npm
- Modern Chromium-based browser or equivalent modern browser

For Credit Note posting/cancellation, use MongoDB Atlas or a MongoDB deployment configured as a replica set so MongoDB transactions are available.

## Typical Business Workflow

```text
Login
  ↓
Manage Clients
  ↓
Create Order / Invoice
  ↓
Add Products / Items
  ↓
Calculate GST + Discount
  ↓
Generate Invoice
  ↓
Record Manual Payments
  ↓
Track Due Amount
  ↓
Generate E-Way Bill (when required)
  ↓
Monitor Analytics / Reports
  ↓
Create Credit Note when required
  ↓
Adjust Due / Refund / Customer Credit
  ↓
Update Inventory when applicable
```

## Design Goals

The project is intended to provide:

- Centralized business operations
- Accurate invoice and payment tracking
- Strong server-side financial validation
- Reusable customer and product data
- Audit-friendly financial documents
- GST-ready billing workflows
- Inventory-aware sales returns
- Business analytics and reporting
- Responsive browser-based operation
- Extensible architecture for future accounting and CRM features

## Validation

GitHub Actions validates every push with backend JavaScript syntax checks plus frontend lint and production build checks.

## Current Repository

**GitHub:** https://github.com/UB-InfoTech/billing

Built and maintained by **Bhanderi Info Tech**.
