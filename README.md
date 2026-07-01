# DisasterWatch-AI-Real-Time-Disaster-Intelligence-Prediction-Platform

A comprehensive disaster monitoring and response platform with real-time data visualization, ML-powered risk prediction, and community reporting features.

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- npm 9+

### Installation
```bash
# Clone the repository
git clone <repository-url>
cd disasterwatch-fullstack

# Install all dependencies
npm install

# Set up the database
npm run db:push
npm run db:seed

# Start development servers
npm run dev
```

This will start both frontend (http://localhost:3000) and backend (http://localhost:4000) servers.

### Alternative: Start individually
```bash
# Backend only
npm run backend:dev

# Frontend only
npm run frontend:dev
```

## 📂 Project Structure

```
disasterwatch-fullstack/
├── frontend/          # Vanilla JS SPA
├── backend/           # Node.js/Express API
├── package.json       # Root workspace config
├── .env.example       # Environment variables template
└── README.md          # This file
```

## 🛠 Tech Stack

### Frontend
- **Framework**: Vanilla JavaScript (ES6+)
- **Styling**: CSS3 with custom properties
- **Server**: Express.js static file server

### Backend
- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: SQLite (development) / PostgreSQL (production)
- **ORM**: Prisma
- **Auth**: JWT with bcrypt
- **Validation**: Joi
- **Logging**: Winston

### Features
- Real-time disaster monitoring
- Interactive map visualization
- ML-powered risk prediction
- Community reporting system
- User authentication & authorization
- RESTful API with pagination
- CORS enabled for cross-origin requests

## 🔧 Development

### Database Management
```bash
# Push schema changes
npm run db:push

# Generate Prisma client
npm run db:generate

# Seed with demo data
npm run db:seed

# Open Prisma Studio
npm run db:studio
```

### API Endpoints
- `GET /api/v1/hazards` - List disaster events
- `POST /api/v1/auth/login` - User authentication
- `POST /api/v1/hazards/sync` - Sync external data feeds
- See backend routes for complete API documentation

### Environment Variables
Copy `.env.example` to `.env` and configure:

```env
# Frontend
API_BASE_URL=http://localhost:4000/api/v1

# Backend
NODE_ENV=development
PORT=4000
DATABASE_URL="file:./dev.db"
JWT_ACCESS_SECRET=your_secret_here
JWT_REFRESH_SECRET=your_secret_here
```

## 🚀 Deployment

### Production Build
```bash
# Build backend
npm run backend:build

# Frontend (no build step for vanilla JS)
```

### Environment Setup
- Set `NODE_ENV=production`
- Use PostgreSQL database
- Configure proper JWT secrets
- Set up reverse proxy (nginx/Caddy)
