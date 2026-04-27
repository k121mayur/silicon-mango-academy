# Silicon Mango Academy

Initial full-stack scaffold for Silicon Mango Academy using React on the frontend, FastAPI on the backend, and PostgreSQL as the database.

## Project Structure

```text
silicon-mango-academy/
├── backend/
│   ├── app/
│   ├── .env
│   ├── .env.example
│   ├── main.py
│   └── requirements.txt
├── frontend/
│   ├── src/
│   ├── .env
│   ├── .env.example
│   ├── package.json
│   └── vite.config.js
├── docker-compose.yml
└── .gitignore
```

## Backend Setup

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload
```

The API will start at `http://localhost:8000`.

## Frontend Setup

```powershell
cd frontend
npm install
npm run dev
```

The frontend will start at `http://localhost:5173` and call the backend using `VITE_API_BASE_URL`.

## PostgreSQL Setup

```powershell
docker compose up -d postgres
```

The default database connection string is already configured in `backend/.env`:

```env
DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/silicon_academy
```

The backend also auto-creates the master admin account on startup using these env values:

```env
MASTER_ADMIN_NAME=Master Admin
MASTER_ADMIN_EMAIL=admin@siliconmango.academy
MASTER_ADMIN_PASSWORD=Admin@123
DEFAULT_INSTRUCTOR_PASSWORD=Instructor@123
```

## Current API Routes

- `POST /api/v1/auth/login` authenticates admin, instructor, and student users.
- `GET /api/v1/auth/me` returns the authenticated user.
- `GET /api/v1/health` returns a health payload.
- `/api/v1/admin/*` exposes admin-only endpoints for users, courses, batches, and instructor assignment.
