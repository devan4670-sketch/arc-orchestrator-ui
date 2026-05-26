"""
Arc Agent Orchestrator — FastAPI Backend
Claude sebagai otak, nanopayments USDC di Arc Testnet.
"""

import json
import asyncio
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional

from orchestrator.brain import OrchestratorBrain
from orchestrator.wallet import WalletManager

app = FastAPI(title="Arc Agent Orchestrator", version="1.0.0")

# Bug fix 4: CORS pakai allow_origin_regex untuk wildcard Vercel
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class TaskRequest(BaseModel):
    task: str
    model: Optional[str] = "claude-opus-4-6"


@app.get("/")
async def root():
    return {"status": "Arc Orchestrator running", "byok": True}


@app.get("/wallet")
async def get_wallet():
    # Return empty wallet state untuk tampilan awal
    return {
        "balance_usdc": 10.0,
        "spent_this_session": 0.0,
        "max_per_task": 1.0,
        "transaction_count": 0,
        "transactions": [],
    }


@app.post("/task")
async def run_task(
    req: TaskRequest,
    x_anthropic_key: Optional[str] = Header(None),
):
    """
    Run a task via Claude. Returns Server-Sent Events stream.
    API key datang dari header X-Anthropic-Key (BYOK).
    """
    if not x_anthropic_key or not x_anthropic_key.startswith("sk-ant-"):
        raise HTTPException(
            status_code=401,
            detail="Anthropic API key diperlukan. Masukkan key kamu di Settings.",
        )

    # Bug fix 3: wallet baru per request, tidak shared global
    wallet = WalletManager()
    brain = OrchestratorBrain(
        wallet=wallet,
        anthropic_api_key=x_anthropic_key,
        model=req.model or "claude-opus-4-6",
    )

    async def event_stream():
        try:
            async for event in brain.run(req.task):
                yield f"data: {json.dumps(event)}\n\n"
                await asyncio.sleep(0)
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
        finally:
            yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "network": "arc-testnet",
        "byok": True,
        "supported_models": [
            "claude-opus-4-6",
            "claude-sonnet-4-6",
            "claude-haiku-4-5-20251001",
        ],
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
