# AI-Powered Product Recommendation Engine (Web App)

Full-stack demo application for an e-commerce style catalog with behavior tracking and multiple recommendation strategies. The stack pairs a **Next.js** storefront and admin UI with a **FastAPI** backend, **PostgreSQL** (with pgvector image in Docker for local dev), and optional **Redis** for caching recommendation responses.

## Features

- **Authentication**: Register, login, JWT-protected routes.
- **Catalog**: Product listing with pagination, search, category filter, and optional filter for uncategorized products (`uncategorized=true` on the public products API).
- **Product detail**: Similar products and frequently-bought-together sections driven by the recommendation services.
- **Cart and orders**: Cart API and order flow integrated with the catalog.
- **Event tracking**: View, click, cart, purchase, and search events for building user-item signal.
- **Recommendations**: Hybrid and content/collaborative style logic implemented in the backend (see `Read.md` in this repo for algorithm-oriented documentation).
- **Admin**: Dashboard metrics, optional system readiness (`/health/ready`), catalog CRUD, image uploads under `/uploads`, category management patterns in the UI.
- **Operations**: Request IDs on API traffic, structured error handling, health endpoints suitable for probes.

## Repository layout

```
backend/          FastAPI app (SQLAlchemy, scikit-learn, etc.)
frontend/         Next.js 16 (App Router), Tailwind CSS
docker-compose.ymlPostgreSQL (pgvector) + Redis for local dependencies
Read.md           Detailed Thai-language feature and algorithm notes (optional read)
```

## Prerequisites

- **Node.js** (compatible with Next.js 16) and npm
- **Python** 3.11+ recommended (3.14 may work; use a venv and install `backend/requirements.txt`)
- **Docker** (optional but recommended) for Postgres and Redis

## Quick start (database and cache)

From the repository root:

```bash
docker compose up -d
```

This starts:

- PostgreSQL on host port **5433** (user/db/password `recengine` per `docker-compose.yml`)
- Redis on **6379**

Configure the backend `DATABASE_URL` to match (see `backend/.env.example`).

### Inspecting tables (PostgreSQL)

After `docker compose up -d`, Postgres listens on host port **5433** (mapped from `5432` in the container). In Docker Desktop, expand the compose project row; the database service is **`recengine-db`** (image `pgvector/pgvector:pg16`). The empty “Image” column on the **project** row is normal—expand it to see each container’s image.

Connection settings from `docker-compose.yml`:

- Host: `127.0.0.1` (from your machine)
- Port: `5433`
- User / password / database: `recengine`

**CLI from your PC** (requires `psql` installed):

```bash
psql postgresql://recengine:recengine@127.0.0.1:5433/recengine
```

Inside `psql`, useful commands: `\dt` (list tables), `\d products` (columns for `products`), `SELECT id, name, image_url FROM products LIMIT 10;`

**CLI via Docker** (no local `psql` needed):

```bash
docker exec -it recengine-db psql -U recengine -d recengine
```

**GUI**: [pgAdmin](https://www.pgadmin.org/), [DBeaver](https://dbeaver.io/), or the database panel in VS Code/Cursor—use the same host, port, user, password, and database as above. Product images are stored in the `products.image_url` column.

## Backend setup

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env: DATABASE_URL, SECRET_KEY; optionally REDIS_URL, BOOTSTRAP_ADMIN_*
```

Run the API (default port **8000**):

```bash
cd backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

On startup (unless `SKIP_DB_BOOTSTRAP=1`), the app creates tables, may seed demo products, repair legacy image URLs, and optionally create a bootstrap admin user if the `BOOTSTRAP_ADMIN_*` variables are set.

Interactive docs: `http://127.0.0.1:8000/docs`

## Frontend setup

```bash
cd frontend
cp .env.local.example .env.local
npm install
npm run dev
```

Development server defaults to **http://localhost:3000**. The Next.js config rewrites `/api/*`, `/uploads/*`, and `/health*` to the FastAPI target (`API_PROXY_TARGET`, default `http://127.0.0.1:8000`), so the browser can call same-origin `/api` without CORS configuration in typical local setups.

Production build:

```bash
cd frontend
npm run build
npm start
```

## Environment variables (summary)

| Area | File | Notes |
|------|------|--------|
| Backend | `backend/.env` | `DATABASE_URL`, `SECRET_KEY`, `CORS_ORIGINS`, optional `CORS_ALLOW_LAN_REGEX`, `REDIS_URL`, bootstrap admin vars |
| Frontend | `frontend/.env.local` | Usually empty for local dev; `NEXT_PUBLIC_API_URL` only if you bypass rewrites; `API_INTERNAL_URL` for SSR in Docker |

See `backend/.env.example` and `frontend/.env.local.example` for comments.

## Useful API paths

- `GET /api/products` — List products (`page`, `limit`, `search`, `category`, `uncategorized`)
- `GET /api/products/categories` — Distinct non-empty categories
- `GET /api/products/{id}` — Product with similar and bought-together lists
- `GET /health` and `GET /health/ready` — Liveness and readiness (database, Redis)
- Admin routes under `POST/PUT/DELETE /api/admin/...` with a valid JWT for an `is_admin` user

## Scripts

- Frontend: `npm run dev`, `npm run build`, `npm run start`, `npm run lint`
- Backend: run via `uvicorn`; tests or migrations depend on your local toolchain (`alembic` is listed in requirements if you extend the project with migrations)

## License and attribution

Add your preferred license and credits here if you publish the repository publicly.

## Further reading

For a long-form description of events, weights, and recommendation concepts in Thai, open **`Read.md`** in this directory. It is documentation-only and complements this README.
