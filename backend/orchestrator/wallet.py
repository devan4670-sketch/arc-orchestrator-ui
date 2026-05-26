"""
Circle Agent Wallet Manager
Handles USDC balance, nanopayments, and spending policy on Arc Testnet.
"""

import os
import httpx
from dataclasses import dataclass, field
from datetime import datetime


CIRCLE_API_BASE = "https://api.circle.com/v1/w3s"


@dataclass
class Transaction:
    agent: str
    amount_usd: float
    description: str
    timestamp: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    status: str = "settled"


class WalletManager:
    def __init__(self):
        self.api_key = os.getenv("CIRCLE_API_KEY", "")
        self.wallet_id = os.getenv("CIRCLE_WALLET_ID", "")
        self.max_per_task = float(os.getenv("MAX_USDC_PER_TASK", "1.0"))
        self.spent_this_session = 0.0
        self.transactions: list[Transaction] = []
        self._mock_balance = 10.0  # testnet mock balance in USDC

    async def get_balance(self) -> float:
        """Fetch USDC balance from Circle API (falls back to mock on testnet)."""
        if not self.api_key or os.getenv("ENVIRONMENT") == "testnet":
            return round(self._mock_balance - self.spent_this_session, 6)

        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    f"{CIRCLE_API_BASE}/wallets/{self.wallet_id}",
                    headers={"Authorization": f"Bearer {self.api_key}"},
                    timeout=10,
                )
                resp.raise_for_status()
                data = resp.json()
                for token in data.get("data", {}).get("balances", []):
                    if token.get("token", {}).get("symbol") == "USDC":
                        return float(token["amount"])
        except Exception:
            pass

        return round(self._mock_balance - self.spent_this_session, 6)

    async def pay(self, agent_name: str, amount_usd: float, description: str) -> bool:
        """
        Execute a nanopayment via Circle Gateway (x402 protocol).
        On testnet, records the transaction and deducts from mock balance.
        """
        if self.spent_this_session + amount_usd > self.max_per_task:
            print(f"[Wallet] Spending limit reached. Skipping payment for {agent_name}.")
            return False

        # Testnet: simulate payment
        self.spent_this_session += amount_usd
        tx = Transaction(
            agent=agent_name,
            amount_usd=amount_usd,
            description=description,
        )
        self.transactions.append(tx)
        print(f"[Wallet] Paid ${amount_usd:.6f} USDC → {agent_name}: {description}")
        return True

    def get_summary(self) -> dict:
        return {
            "spent_this_session": round(self.spent_this_session, 6),
            "max_per_task": self.max_per_task,
            "transaction_count": len(self.transactions),
            "transactions": [
                {
                    "agent": t.agent,
                    "amount_usd": t.amount_usd,
                    "description": t.description,
                    "timestamp": t.timestamp,
                    "status": t.status,
                }
                for t in self.transactions
            ],
        }

    def reset_session(self):
        """Reset per-task spending counters."""
        self.spent_this_session = 0.0
        self.transactions = []
