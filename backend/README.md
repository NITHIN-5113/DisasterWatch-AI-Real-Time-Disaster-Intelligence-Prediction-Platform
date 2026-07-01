# DisasterWatch — Backend API

> **Node.js · Express · Prisma · PostgreSQL**  
> REST API that backs the DisasterWatch v4 vanilla-JS frontend.

---

## Table of Contents

1. [Architecture](#architecture)
2. [Prerequisites](#prerequisites)
3. [Quick Start](#quick-start)
4. [Environment Variables](#environment-variables)
5. [Database Setup](#database-setup)
6. [Running the Server](#running-the-server)
7. [API Reference](#api-reference)
8. [Authentication Flow](#authentication-flow)
9. [Role-Based Access](#role-based-access)
10. [Rate Limiting](#rate-limiting)
11. [Error Format](#error-format)
12. [Deployment](#deployment)

---

## Architecture

```
disasterwatch-backend/
│
├── prisma/
│   ├── schema.prisma        ← Database schema (PostgreSQL)
│   └── seed.js              ← Demo data seeder
│
├── src/
│   ├── app.js               ← Express app factory
│   ├── config/
│   │   ├── cors.js          ← CORS policy
│   │   └── prisma.js        ← Prisma singleton
│   │
│   ├── controllers/         ← Business logic (one file per domain)
│   │   ├── authController.js
│   │   ├── userController.js
│   │   ├── hazardController.js
│   │   ├── mlController.js
│   │   └── exportController.js
│   │
│   ├── routes/              ← Express routers (one file per domain)
│   │   ├── authRoutes.js
│   │   ├── userRoutes.js
│   │   ├── hazardRoutes.js
│   │   ├── mlRoutes.js
│   │   └── exportRoutes.js
│   │
│   ├── middleware/
│   │   ├── auth.js          ← JWT authenticate + role authorize
│   │   ├── validate.js      ← Joi validation factory
│   │   ├── rateLimiter.js   ← express-rate-limit configs
│   │   ├── errorHandler.js  ← Centralized error handler
│   │   └── notFound.js      ← 404 handler
│   │
│   ├── validators/          ← Joi schemas
│   │   ├── authValidator.js
│   │   └── hazardValidator.js
│   │
│   └── utils/
│       ├── jwt.js           ← Sign / verify tokens
│       ├── logger.js        ← Winston logger
│       └── response.js      ← success / paginated / ApiError helpers
│
├── server.js                ← Entry point
├── .env.example             ← Environment variable template
└── package.json
```

---

## Prerequisites

| Tool | Minimum Version |
|------|----------------|
| Node.js | 18.x |
| npm | 9.x |
| PostgreSQL | 14.x |

---

## Quick Start

```bash
# 1. Clone & install
git clone https://github.com/your-org/disasterwatch-backend.git
cd disasterwatch-backend
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env — set DATABASE_URL and JWT secrets (see below)

# 3. Generate Prisma client & run migrations
npm run db:generate
npm run db:push       # or: npm run db:migrate (for tracked migrations)

# 4. Seed demo accounts
npm run db:seed

# 5. Start the dev server
npm run dev
# → API available at http://localhost:4000
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NODE_ENV` | No | `development` \| `production` \| `test` (default: `development`) |
| `PORT` | No | HTTP port (default: `4000`) |
| `LOG_LEVEL` | No | Winston log level (default: `info`) |
| `DATABASE_URL` | **Yes** | PostgreSQL connection string |
| `JWT_ACCESS_SECRET` | **Yes** | Secret for signing access tokens (min 32 chars) |
| `JWT_REFRESH_SECRET` | **Yes** | Secret for signing refresh tokens (min 32 chars) |
| `JWT_ACCESS_TTL` | No | Access token lifetime (default: `15m`) |
| `JWT_REFRESH_TTL` | No | Refresh token lifetime (default: `7d`) |
| `ALLOWED_ORIGINS` | No | Comma-separated CORS origins |

**Generating secure secrets:**
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

---

## Database Setup

### Option A — Instant push (development)
```bash
npm run db:push       # Syncs schema without migration files
npm run db:seed       # Creates 3 demo users
```

### Option B — Migrations (recommended for production)
```bash
npm run db:migrate    # Creates a migration file + applies it
npm run db:seed
```

### Prisma Studio (GUI)
```bash
npm run db:studio     # Opens browser UI at http://localhost:5555
```

---

## Running the Server

```bash
npm run dev     # Development (auto-restart via nodemon)
npm start       # Production
```

**Health check:**
```
GET http://localhost:4000/health
→ { "status": "ok", "ts": "..." }
```

---

## API Reference

All endpoints are prefixed with `/api/v1`.

### Authentication — `/auth`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/register` | Public | Create account |
| POST | `/auth/login` | Public | Login → tokens |
| POST | `/auth/refresh` | Public | Rotate tokens |
| POST | `/auth/logout` | Bearer | Revoke refresh token |
| GET | `/auth/me` | Bearer | Current user info |
| PATCH | `/auth/password` | Bearer | Change password |

**Register**
```json
POST /api/v1/auth/register
{
  "email": "user@example.com",
  "password": "Secure1234!",
  "name": "Jane Doe"
}
```

**Login response**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJ...",
    "refreshToken": "eyJ...",
    "user": { "id": "...", "email": "...", "role": "USER" }
  }
}
```

---

### Hazard Events — `/hazards`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/hazards` | Public | List events (filtered) |
| GET | `/hazards/stats` | Public | Aggregate statistics |
| GET | `/hazards/nearby` | Public | Events near lat/lng |
| GET | `/hazards/:id` | Public | Single event detail |
| POST | `/hazards/sync` | ANALYST+ | Pull from USGS & cache |

**Query parameters for `GET /hazards`:**

| Param | Type | Example |
|-------|------|---------|
| `type` | string | `EARTHQUAKE` |
| `minMag` | float | `4.5` |
| `maxMag` | float | `7.0` |
| `from` | ISO date | `2024-01-01T00:00:00Z` |
| `to` | ISO date | `2024-12-31T23:59:59Z` |
| `page` | int | `1` |
| `perPage` | int | `50` (max 500) |
| `sortBy` | string | `occurredAt` \| `magnitude` \| `riskScore` |
| `order` | string | `asc` \| `desc` |

**Sync USGS:**
```
POST /api/v1/hazards/sync?feed=all_day
Authorization: Bearer <token>

Feed options: all_hour | all_day | all_week | all_month | sig_month
```

---

### ML Scores — `/ml`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/ml/stats` | Bearer | ML summary stats |
| GET | `/ml/anomalies` | Bearer | Anomalous events |
| GET | `/ml/high-risk` | Bearer | High risk-score events |
| GET | `/ml/:eventId` | Bearer | Score for one event |
| POST | `/ml/scores` | ANALYST+ | Save a single score |
| POST | `/ml/scores/batch` | ANALYST+ | Save scores in bulk |

**Save ML scores from the frontend (call after TF.js inference):**
```json
POST /api/v1/ml/scores/batch
{
  "scores": [
    {
      "eventId": "cuid_...",
      "magPrediction": 4.2,
      "aftershockProb": 0.34,
      "clusterIndex": 2,
      "riskScore": 61.5,
      "riskLevel": "Severe",
      "isAnomaly": false,
      "anomalyZScore": 1.1
    }
  ]
}
```

---

### Users — `/users`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/users` | ADMIN | List all users |
| GET | `/users/:id` | Bearer (self or ADMIN) | User detail |
| PATCH | `/users/me` | Bearer | Update own profile |
| DELETE | `/users/:id` | ADMIN | Deactivate user |
| GET | `/users/saved` | Bearer | Saved events |
| POST | `/users/saved` | Bearer | Save an event |
| DELETE | `/users/saved/:id` | Bearer | Remove saved event |
| GET | `/users/alerts` | Bearer | Alert preferences |
| POST | `/users/alerts` | Bearer | Upsert alert pref |
| DELETE | `/users/alerts/:id` | Bearer | Remove alert pref |

---

### Export — `/export`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/export/hazards` | Bearer | Export events (CSV/JSON) |
| GET | `/export/ml` | Bearer | Export ML scores |
| GET | `/export/logs` | ADMIN | Audit log of exports |

```
GET /api/v1/export/hazards?format=csv&type=EARTHQUAKE&minMag=4&limit=2000
Authorization: Bearer <token>
→ Downloads earthquakes_export.csv
```

---

## Authentication Flow

```
┌─────────┐      POST /auth/login      ┌─────────────┐
│ Client  │ ─────────────────────────► │  API Server │
│         │ ◄─────────────────────────  │             │
│         │  accessToken (15m)          │             │
│         │  refreshToken (7d)          │             │
│         │                             │             │
│         │  GET /hazards               │             │
│         │  Authorization: Bearer AT   │             │
│         │ ─────────────────────────► │             │
│         │ ◄─────────────────────────  │             │
│         │  200 OK + data              │             │
│         │                             │             │
│         │  [AT expires]               │             │
│         │  POST /auth/refresh         │             │
│         │  { refreshToken }           │             │
│         │ ─────────────────────────► │             │
│         │ ◄─────────────────────────  │             │
│         │  new accessToken            │             │
│         │  new refreshToken (rotated) │             │
└─────────┘                             └─────────────┘
```

Store `accessToken` in memory (JS variable). Store `refreshToken` in an `httpOnly` cookie or secure storage.

---

## Role-Based Access

| Role | Can do |
|------|--------|
| `USER` | Read hazards, save events, manage own alerts |
| `ANALYST` | All of USER + sync USGS data + write ML scores |
| `ADMIN` | All of ANALYST + manage users + view export audit log |

---

## Rate Limiting

| Limiter | Applies to | Limit |
|---------|-----------|-------|
| Global | All `/api/` routes | 200 req / 15 min |
| Auth | `/auth/login`, `/auth/register` | 10 req / 15 min |
| Data | `/hazards/sync`, `/export/*` | 30 req / min |

---

## Error Format

All errors follow this shape:

```json
{
  "success": false,
  "message": "Validation failed",
  "details": [
    { "field": "email", "message": "must be a valid email" }
  ],
  "ts": "2024-06-01T12:00:00.000Z"
}
```

| Status | Meaning |
|--------|---------|
| 400 | Bad request / validation error |
| 401 | Missing or invalid token |
| 403 | Insufficient role |
| 404 | Resource not found |
| 409 | Conflict (duplicate) |
| 429 | Rate limit exceeded |
| 500 | Internal server error |

---

## Deployment

### Docker (recommended)

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN npx prisma generate
EXPOSE 4000
CMD ["node", "server.js"]
```

```bash
docker build -t disasterwatch-api .
docker run -p 4000:4000 --env-file .env disasterwatch-api
```

### Connecting the Frontend

Update your vanilla JS frontend to point API calls at the backend:

```javascript
// In app.js — replace direct USGS fetch with your backend
const BASE = 'http://localhost:4000/api/v1';

// Login
const { data } = await fetchJson(`${BASE}/auth/login`, {
  method: 'POST',
  body: JSON.stringify({ email, password }),
});
sessionStorage.setItem('dw_token', data.accessToken);

// Authenticated request
const headers = { Authorization: `Bearer ${sessionStorage.getItem('dw_token')}` };
const quakes  = await fetchJson(`${BASE}/hazards?type=EARTHQUAKE&perPage=200`, { headers });
```

---

## Demo Accounts (after seeding)

| Email | Password | Role |
|-------|----------|------|
| `admin@disasterwatch.dev` | `Admin1234!` | ADMIN |
| `analyst@disasterwatch.dev` | `Analyst1234!` | ANALYST |
| `test@example.com` | `Demo1234!` | USER |
