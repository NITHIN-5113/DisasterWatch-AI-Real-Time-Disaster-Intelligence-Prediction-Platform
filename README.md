# DisasterWatch - Operations Command Center

A real-time geospatial operations and disaster intelligence platform providing live satellite imagery, precipitation radar playback, multi-hazard alerts (earthquakes, cyclones, wildfires, floods, volcanoes), and atmospheric forecast maps.

## Quick Start

### Prerequisites
- Node.js 18+
- npm 9+

### Installation
```bash
# Clone the repository
git clone <repository-url>
cd disasterwatch-fullstack

# Install dependencies
npm install

# Initialize the database schema and seed demo users
npm run db:push
npm run db:seed

# Start development servers
npm run dev
```

This starts both the frontend command center (http://localhost:8000) and the backend API service (http://localhost:4000).

### Start Individually
```bash
# Backend API only
npm run backend:dev

# Frontend UI only
npm run frontend:dev
```

## Project Structure

```
disasterwatch-fullstack/
├── frontend/          # Operations Command Center (Vanilla JS & Leaflet)
├── backend/           # Node.js/Express REST API with Prisma ORM
├── scripts/           # CI and validation scripts (e.g. check-emojis.js)
├── package.json       # Monorepo workspace configuration
├── .env.example       # Root environment variable template
└── README.md          # Project documentation
```

## Tech Stack

### Frontend
- Framework: Modern Vanilla JavaScript (ES6+ modular architecture)
- Geospatial: Leaflet with high-resolution tile layers (Esri, NASA GIBS, OpenStreetMap)
- Radar: RainViewer past observed radar time-series frames with playback animation
- Weather: Open-Meteo current and hourly atmospheric models
- Styling: Industrial dark operations command center theme with CSS custom properties

### Backend
- Runtime: Node.js (v18+)
- Framework: Express.js with Helmet and CORS
- Database: SQLite (local development) / PostgreSQL (production)
- ORM: Prisma Client
- Security: JWT (Access & Refresh tokens) with bcrypt password hashing
- Validation: Joi schemas
- Ingestion: Parallel multi-source ingestion from USGS, GDACS, NASA EONET, RainViewer, Open-Meteo

## Development & Database Management

```bash
# Push schema updates
npm run db:push

# Generate Prisma client
npm run db:generate

# Seed database
npm run db:seed

# Run backend unit tests and emoji linting
npm test

# Verify zero emojis across the codebase
npm run lint:emoji
```

## API Endpoints

- `GET /api/v1/hazards/live` - Normalized multi-hazard events (USGS, GDACS, NASA EONET)
- `GET /api/v1/hazards/radar-frames` - 13 past + nowcast radar frames for timeline animation
- `GET /api/v1/hazards/weather-point` - Live atmospheric telemetry (temp, wind, pressure, rain, humidity)
- `GET /api/v1/hazards` - Filterable database list of disaster events
- `POST /api/v1/auth/login` - User authentication and token issuance
- `POST /api/v1/hazards/sync` - On-demand synchronization of authoritative USGS feeds

## Environment Variables

Copy `.env.example` to `.env`:

```env
# Frontend
API_BASE_URL=http://localhost:4000/api/v1

# Backend
NODE_ENV=development
PORT=4000
DATABASE_URL="file:./dev.db"
JWT_ACCESS_SECRET=your_access_secret_minimum_32_chars_change_this
JWT_REFRESH_SECRET=your_refresh_secret_minimum_32_chars_change_this
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=7d
ALLOWED_ORIGINS=http://localhost:8000,http://localhost:3000,http://127.0.0.1:8000,http://127.0.0.1:3000
```
