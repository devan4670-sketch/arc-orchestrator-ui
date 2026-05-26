# Arc Agent Orchestrator

Claude Opus sebagai otak · Arc Testnet · USDC Nanopayments · Vercel UI

---

## Cara Menjalankan

### Backend (FastAPI)

```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # isi ANTHROPIC_API_KEY
python main.py
```
Backend berjalan di http://localhost:8000

### Frontend (Next.js)

```bash
cd frontend
npm install
cp .env.local.example .env.local
npm run dev
```
UI berjalan di http://localhost:3000

---

## Deploy ke Vercel

1. Push folder `frontend/` ke GitHub
2. Import repo di vercel.com
3. Set environment variable: `BACKEND_URL` = URL backend kamu
4. Deploy

---

## Struktur File

```
backend/
├── main.py                  # FastAPI entry point
├── orchestrator/
│   ├── brain.py             # Claude Opus + tool use
│   └── wallet.py            # Circle Agent Wallet
└── agents/
    ├── web_agent.py         # fetch/search web ($0.0005/call)
    └── compute_agent.py     # kalkulasi & analisis ($0.0002/call)

frontend/
├── app/
│   ├── page.tsx             # UI utama
│   ├── layout.tsx
│   └── api/task/route.ts    # proxy ke backend
├── vercel.json
└── package.json
```
