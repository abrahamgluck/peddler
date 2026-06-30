# Vendtap — Smart Warehouse Management

An open, self-hostable **Warehouse Management System (WMS)** for wholesale,
distribution, and vending businesses — a feature-compatible re-implementation of
the workflows offered by [Vendtap](https://vendtap.net) (`net.vendtap.mobile`).

Salesmen create invoices and take payments on the go, the warehouse keeps a live
inventory with a full movement ledger, managers track collections and the
delivery fleet, and everyone shares the same daily / weekly / monthly reports.

> **Scope note:** This is a **standalone clone** of the documented Vendtap
> feature set, not a client for Vendtap's private servers. It does not connect to
> `vendtap.net`. The data model and screens are modeled on Vendtap's public
> description (web admin panel + Android app for sales, warehouse, and trucks).

## Features

| Area | What it does |
| --- | --- |
| **Auth & roles** | JWT login with `admin`, `salesman`, and `warehouse` roles |
| **Inventory** | Products with SKU, cost/price, live stock, reorder levels, low-stock flags, and a per-product movement ledger |
| **Customers** | Store/account directory with running A/R balance and invoice history |
| **Invoices** | Multi-line sales orders that deduct live inventory atomically; void restores stock |
| **Payments** | Record cash/card/check/transfer payments; invoices move `open → partial → paid` |
| **Trucks** | Delivery fleet with driver assignment and route status |
| **Reports** | Dashboard KPIs, daily/weekly/monthly sales & collections, top-selling products |

## Tech stack

- **Backend** — Node.js + Express, SQLite (`better-sqlite3`), JWT auth, bcrypt
  password hashing. Pure REST JSON API under `/api`.
- **Frontend** — React + TypeScript + Vite, React Router. Responsive layout that
  works on a phone for salesmen in the field.

## Project layout

```
vendtap/
├── server/              # Express API + SQLite
│   ├── src/
│   │   ├── db.js        # schema bootstrap
│   │   ├── auth.js      # hashing, JWT, middleware
│   │   ├── seed.js      # demo data
│   │   └── routes/      # auth, products, customers, invoices, payments, trucks, reports
│   └── server.js
└── web/                 # React + Vite SPA
    └── src/
        ├── api.ts       # fetch wrapper + auth token
        ├── auth.tsx     # auth context
        └── pages/       # Login, Dashboard, Products, Customers, Invoices, Trucks, Reports
```

## Getting started

### 1. Backend

```bash
cd vendtap/server
npm install
npm run seed      # creates vendtap.db with demo data
npm start         # http://localhost:4000
```

### 2. Frontend

```bash
cd vendtap/web
npm install
npm run dev       # http://localhost:5173 (proxies /api to :4000)
```

Open http://localhost:5173 and sign in.

### Production (single server)

Build the SPA and let Express serve it:

```bash
cd vendtap/web && npm install && npm run build
cd ../server && npm install && npm run seed && npm start
# whole app on http://localhost:4000
```

## Demo logins

| Username | Password | Role |
| --- | --- | --- |
| `Gluck1` | `5310` | admin |
| `sam` | `sam123` | salesman |
| `wendy` | `wendy123` | warehouse |

## API reference (abridged)

All routes except `POST /api/auth/login` require an `Authorization: Bearer <token>` header.

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/auth/login` | Obtain a JWT |
| GET | `/api/reports/dashboard` | Headline KPIs |
| GET | `/api/reports/sales?period=daily\|weekly\|monthly` | Sales/collections by period |
| GET | `/api/products?search=&low=1` | List / filter products |
| POST | `/api/products/:id/adjust` | Restock / correct stock (ledgered) |
| GET/POST | `/api/customers` | List / create customers |
| GET/POST | `/api/invoices` | List / create invoices (deducts stock) |
| POST | `/api/invoices/:id/void` | Void & restore stock |
| POST | `/api/payments/invoice/:id` | Record a payment |
| GET/POST/PUT | `/api/trucks` | Manage delivery trucks |

## Configuration

| Env var | Default | Notes |
| --- | --- | --- |
| `PORT` | `4000` | API/server port |
| `JWT_SECRET` | dev secret | **Set in production** |
| `VENDTAP_DB` | `server/vendtap.db` | SQLite file path |
| `TAX_RATE` | `0` | Applied to invoice subtotals (resale is often tax-exempt) |

## License

MIT.
