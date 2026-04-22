# Silicon Academy Portal

Initial full-stack scaffold for the Silicon Academy Portal using React on the frontend, FastAPI on the backend, and PostgreSQL as the database.

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

## Current API Routes

- `GET /` returns a basic API startup message.
- `GET /api/v1/health` returns a health payload used by the React starter screen.
