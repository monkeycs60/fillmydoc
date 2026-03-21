# FillMyDoc

## Project structure

- `backend/` — Hono API (TypeScript, Node.js)
- `frontend/` — React + Vite + Tailwind

## Dev commands

```bash
# Backend
cd backend && npm run dev    # port 3001

# Frontend
cd frontend && npm run dev   # port 5173, proxies /api to :3001
```

## Stack

- **Backend**: Hono, docxtemplater, PizZip, PapaParse, archiver, LibreOffice headless
- **Frontend**: React 19, Vite, Tailwind CSS, PapaParse

## Key endpoints

- `POST /api/template/parse` — Upload .docx, returns extracted `{variables}`
- `POST /api/generate` — Upload .docx + .csv + mapping config, returns .zip of PDFs

## Template format

Word documents use `{variable_name}` syntax for placeholders. LibreOffice headless converts filled .docx to PDF on the server.

## Code style

- ESM (`"type": "module"`)
- Strict TypeScript
- No semicolons enforcement — use them consistently
