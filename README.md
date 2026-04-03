# Finance Data Processing and Access Control Backend

A RESTful backend API for a finance dashboard with role-based access control, financial record management, and analytics — built with Node.js and PostgreSQL.

---

## Tech Stack

| Layer        | Choice              | Reason                                              |
|--------------|---------------------|-----------------------------------------------------|
| Runtime      | Node.js             | Fast I/O, great ecosystem for REST APIs             |
| Framework    | Express.js          | Minimal, flexible, widely used                      |
| Database     | PostgreSQL          | Relational, reliable, industry standard             |
| DB Driver    | pg (node-postgres)  | Official PostgreSQL driver, no ORM overhead         |
| Auth         | JWT                 | Stateless authentication, no session storage needed |
| Validation   | express-validator   | Declarative per-route validation rules              |
| Passwords    | bcryptjs            | Industry standard for secure password hashing       |

---

## Project Structure

```
src/
├── config/
│   ├── database.js     # PostgreSQL connection pool
│   └── schema.js       # Auto-creates tables on startup
├── middleware/
│   ├── auth.js         # JWT verification, attaches req.user
│   ├── rbac.js         # Role-based access control
│   └── validate.js     # express-validator error formatter
├── routes/
│   ├── auth.js         # POST /register  POST /login
│   ├── users.js        # User management (admin only)
│   ├── transactions.js # Financial records CRUD + filters
│   └── dashboard.js    # Aggregated summary endpoints
└── app.js              # Express setup, DB connect, server start
```

---

## Local Setup

### 1. Prerequisites

- **Node.js** v18 or higher → https://nodejs.org
- **PostgreSQL** v14 or higher → https://www.postgresql.org/download/

### 2. Create the PostgreSQL database

Open pgAdmin or psql and run:

```sql
CREATE DATABASE finance_db;
```

> Tables are created **automatically** when the server starts. You don't need to run any SQL scripts manually.

### 3. Install dependencies

```bash
npm install
```

### 4. Configure environment

```bash
cp .env.example .env
```

Open `.env` and update these values:

```env
PORT=3000
JWT_SECRET=pick_any_long_random_string_here
JWT_EXPIRES_IN=7d
DATABASE_URL=postgresql://postgres:yourpassword@localhost:5432/finance_db
```

Replace `yourpassword` with your actual PostgreSQL password.

### 5. Start the server

```bash
node src/app.js        # normal
npm run dev            # with auto-restart on file changes (nodemon)
```

You should see:
```
✅ PostgreSQL connected
✅ Database schema ready
🚀 Finance backend running on http://localhost:3000
```

---

## Roles and Permissions

| Action                         | Viewer | Analyst | Admin |
|--------------------------------|--------|---------|-------|
| View transactions              | ✅     | ✅      | ✅    |
| View dashboard summaries       | ✅     | ✅      | ✅    |
| Create / update transactions   | ❌     | ✅      | ✅    |
| Delete transactions            | ❌     | ❌      | ✅    |
| Create / manage users          | ❌     | ❌      | ✅    |

---

## API Reference

All endpoints that require authentication need this header:
```
Authorization: Bearer <your_token>
```

---

### Auth

#### Register
```
POST /api/auth/register
```
```json
{
  "name": "Alice",
  "email": "alice@example.com",
  "password": "secret123",
  "role": "admin"
}
```

#### Login
```
POST /api/auth/login
```
```json
{
  "email": "alice@example.com",
  "password": "secret123"
}
```
Both return a `token` — use it in the Authorization header for all further requests.

---

### Users  *(Admin only)*

| Method | Endpoint        | Description                |
|--------|-----------------|----------------------------|
| GET    | /api/users      | List all users             |
| GET    | /api/users/me   | Your own profile           |
| POST   | /api/users      | Create a new user          |
| PATCH  | /api/users/:id  | Update user role or status |

---

### Transactions

| Method | Endpoint              | Roles          | Description              |
|--------|-----------------------|----------------|--------------------------|
| GET    | /api/transactions     | All            | List with filters        |
| GET    | /api/transactions/:id | All            | Get one record           |
| POST   | /api/transactions     | Analyst, Admin | Create transaction       |
| PATCH  | /api/transactions/:id | Analyst, Admin | Update transaction       |
| DELETE | /api/transactions/:id | Admin          | Soft delete              |

#### Filter parameters (GET /api/transactions)
| Param       | Example           | Description              |
|-------------|-------------------|--------------------------|
| `type`      | `income`          | Filter by type           |
| `category`  | `Salary`          | Partial match, case-insensitive |
| `startDate` | `2024-01-01`      | From this date           |
| `endDate`   | `2024-12-31`      | Up to this date          |
| `page`      | `1`               | Page number (default 1)  |
| `limit`     | `20`              | Results per page (max 100) |

#### Transaction body (POST / PATCH)
```json
{
  "amount": 50000,
  "type": "income",
  "category": "Salary",
  "date": "2024-06-01",
  "notes": "June salary"
}
```

---

### Dashboard  *(All authenticated users)*

| Endpoint                      | Description                              |
|-------------------------------|------------------------------------------|
| GET /api/dashboard/summary    | Total income, expenses, net balance      |
| GET /api/dashboard/by-category| Totals grouped by category and type      |
| GET /api/dashboard/monthly    | Monthly income vs expense (all 12 months)|
| GET /api/dashboard/recent     | Latest N transactions                    |

#### Example response — /api/dashboard/summary
```json
{
  "total_income": 120000,
  "total_expenses": 45000,
  "net_balance": 75000,
  "transaction_count": 38
}
```

---

## Error Format

All errors return a consistent shape:
```json
{ "error": "Human-readable message" }
```

Validation errors return HTTP 422:
```json
{
  "error": "Validation failed",
  "details": [
    { "field": "amount", "message": "Amount must be a positive number" }
  ]
}
```

---

## Design Decisions

1. **No ORM** — Raw SQL with parameterized queries (`$1, $2`) for clarity and control. Easy to read and explain.
2. **Role hierarchy** — Roles are mapped to numeric levels (viewer=1, analyst=2, admin=3). A higher level automatically includes lower-level permissions.
3. **Soft delete** — Transactions set a `deleted_at` timestamp instead of being removed. Preserves audit trail.
4. **Auto schema** — Tables are created on first run via `schema.js`. No migration tool needed for this scope.
5. **Connection pool** — `pg.Pool` manages multiple DB connections efficiently. One pool shared across all routes.
6. **Monthly trends always return 12 months** — Months with no data are filled with zeros so the frontend can render a consistent chart.

---

## What Could Be Added

- Unit/integration tests (Jest + supertest)
- Rate limiting (express-rate-limit)
- Refresh tokens
- CSV export
- Full-text search on notes
