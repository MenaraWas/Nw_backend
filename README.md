# NodeWave PM — Backend API

A robust project management API built with Hono, Bun, and Prisma. Features state-based permissions, task dependencies, optimistic locking, and immutable audit trails.

## Tech Stack

- **Runtime**: Bun
- **Framework**: Hono
- **ORM**: Prisma 5.22
- **Database**: PostgreSQL
- **Auth**: JWT (jsonwebtoken)
- **Validation**: Zod
- **Filtering**: @nodewave/prisma-ezfilter

## Getting Started

### Prerequisites

- Bun >= 1.4
- Node.js >= 20 (for Prisma)
- PostgreSQL

### Installation

```bash
# Clone the repository
git clone https://github.com/MenaraWas/nw-backend.git
cd nw-backend

# Install dependencies
bun install

# Setup environment variables
cp .env.example .env
```

### Environment Variables

```env
DATABASE_URL="postgresql://username:password@localhost:5432/nw_backend?schema=public"
JWT_SECRET="your-secret-key"
PORT=3000
```

### Database Setup

```bash
# Run migrations
prisma migrate deploy

# Generate Prisma Client
prisma generate

# Seed database
bun run prisma/seed.ts
```

### Running the Server

```bash
# Development
bun run dev

# Production
bun run start
```

Server runs on `http://localhost:3000`

## Seeded Test Accounts

| Role | Email | Password | Department |
|------|-------|----------|------------|
| PM | pm@nodewave.com | admin123 | PRODUCT |
| INTERNAL | uiux@nodewave.com | admin123 | UIUX |
| INTERNAL | frontend@nodewave.com | admin123 | FRONTEND |
| INTERNAL | backend@nodewave.com | admin123 | BACKEND |
| CLIENT | client@nodewave.com | admin123 | - |

## API Endpoints

### Auth

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/auth/register` | Register new user | No |
| POST | `/api/auth/login` | Login | No |
| GET | `/api/auth/me` | Get current user | Yes |

### Projects

| Method | Endpoint | Description | Role |
|--------|----------|-------------|------|
| GET | `/api/projects` | List all projects | All |
| GET | `/api/projects/:id` | Get project detail | All |
| POST | `/api/projects` | Create project | PM |
| PUT | `/api/projects/:id` | Update project | PM |
| DELETE | `/api/projects/:id` | Soft delete project | PM |
| POST | `/api/projects/:id/members` | Add member | PM |
| DELETE | `/api/projects/:id/members/:userId` | Remove member | PM |

### Tasks

| Method | Endpoint | Description | Role |
|--------|----------|-------------|------|
| GET | `/api/tasks/project/:projectId` | List tasks by project | All |
| POST | `/api/tasks` | Create task | PM |
| PATCH | `/api/tasks/:id/status` | Update task status | PM, INTERNAL |
| PATCH | `/api/tasks/:id/description` | Update description | PM |
| PATCH | `/api/tasks/:id/assignee` | Reassign task | PM |
| PATCH | `/api/tasks/:id/attachment` | Upload attachment | INTERNAL |
| DELETE | `/api/tasks/:id` | Soft delete task | PM |

### Users

| Method | Endpoint | Description | Role |
|--------|----------|-------------|------|
| GET | `/api/users` | List all users | PM |

## Filtering & Pagination

All list endpoints support filtering and pagination via query parameters:

```
GET /api/projects?page=1&rows=9&searchFilters={"name":"dashboard"}
GET /api/tasks/project/:id?page=1&rows=20&filters={"status":"BLOCKED"}
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | number | Page number (default: 1) |
| `rows` | number | Items per page (default: 10) |
| `searchFilters` | JSON string | Full-text search |
| `filters` | JSON string | Exact match filters |
| `orderKey` | string | Field to sort by |
| `orderRule` | asc \| desc | Sort direction |

## Key Features

### State-Based Permissions
Task permissions change based on current status. Backend validates every request regardless of frontend state.

### Task Dependencies
Tasks can have prerequisite tasks. A dependent task is automatically BLOCKED until all prerequisites are DONE. When a task is completed, the system auto-unblocks any dependent tasks whose prerequisites are all satisfied.

### Optimistic Locking
Each task has a `version` field. Updates must include the current version. If versions don't match (concurrent edit), the server returns `409 Conflict`.

### Immutable Audit Trail
Every field change on a task is recorded in the `AuditLog` table with the user, timestamp, field name, old value, and new value. Logs are never deleted.

### Soft Deletes
No data is ever permanently deleted. All entities have a `deletedAt` field. Queries automatically filter `deletedAt: null`.

### Data Masking for Client
CLIENT role responses are filtered at the API level — internal identities, departments, and comments are stripped from responses, not hidden via CSS.

## Deployment

Deployed on [Railway](https://railway.app).

**Live URL**: `https://nwbackend-production.up.railway.app`

## Project Structure

```
src/
├── lib/
│   ├── prisma.ts       # Prisma client singleton
│   └── jwt.ts          # JWT sign/verify utilities
├── middleware/
│   └── auth.ts         # JWT auth middleware
├── routes/
│   ├── auth.ts         # Authentication routes
│   ├── projects.ts     # Project CRUD + member management
│   ├── tasks.ts        # Task management + business logic
│   └── users.ts        # User listing
├── index.ts            # App entry point
prisma/
├── schema.prisma       # Database schema
├── seed.ts             # Seed script
└── migrations/         # Migration files
```

## License

Private — NodeWave Assessment Project