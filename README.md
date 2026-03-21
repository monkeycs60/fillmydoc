# FillMyDoc

Generate batch PDF documents from a Word template and a CSV file. Upload your `.docx` template with `{variables}`, upload a CSV with your data, map the columns, and download a zip of personalized PDFs.

## Quick start

### Prerequisites

- Node.js 20+
- LibreOffice (`sudo apt install libreoffice-writer-nogui`)

### Install & run

```bash
# Backend
cd backend
npm install
npm run dev

# Frontend (separate terminal)
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`.

## How it works

1. Upload a Word template (`.docx`) containing `{variable}` placeholders
2. Upload a CSV file with your data
3. Map template variables to CSV columns
4. Choose a file naming convention (prefix + column)
5. Click generate — download a zip with all your PDFs

## Deployment

- **Backend**: Any VPS with Node.js + LibreOffice (Hetzner, €4/mo)
- **Frontend**: Cloudflare Pages or Vercel (static build)

## License

MIT
