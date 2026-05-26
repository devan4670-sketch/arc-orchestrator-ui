"""
Compute Agent — runs Python expressions & data analysis, pays $0.0002 per call.
"""

import math
import json
from orchestrator.wallet import WalletManager

COST_PER_CALL = 0.0002  # USDC


async def run_calculation(expression: str, wallet: WalletManager) -> str:
    """
    Safely evaluate a math expression or simple Python computation.
    Pays nanopayment before executing.
    """
    paid = await wallet.pay(
        agent_name="compute_agent",
        amount_usd=COST_PER_CALL,
        description=f"compute: {expression[:50]}",
    )
    if not paid:
        return "Error: insufficient balance for computation."

    # Safe eval: only allow math operations
    allowed = {k: getattr(math, k) for k in dir(math) if not k.startswith("_")}
    allowed.update({"abs": abs, "round": round, "min": min, "max": max, "sum": sum})

    try:
        result = eval(expression, {"__builtins__": {}}, allowed)  # noqa: S307
        return str(result)
    except Exception as e:
        return f"Computation error: {str(e)}"


async def analyze_data(data: list | dict, wallet: WalletManager) -> str:
    """
    Basic statistical analysis on a list of numbers.
    Pays nanopayment before executing.
    """
    paid = await wallet.pay(
        agent_name="compute_agent",
        amount_usd=COST_PER_CALL,
        description="data analysis",
    )
    if not paid:
        return "Error: insufficient balance for analysis."

    try:
        if isinstance(data, dict):
            data = list(data.values())

        numbers = [float(x) for x in data if isinstance(x, (int, float))]
        if not numbers:
            return "No numeric data found."

        n = len(numbers)
        total = sum(numbers)
        mean = total / n
        sorted_nums = sorted(numbers)
        median = sorted_nums[n // 2] if n % 2 else (sorted_nums[n//2-1] + sorted_nums[n//2]) / 2
        variance = sum((x - mean) ** 2 for x in numbers) / n
        std_dev = math.sqrt(variance)

        return json.dumps({
            "count": n,
            "sum": round(total, 4),
            "mean": round(mean, 4),
            "median": round(median, 4),
            "std_dev": round(std_dev, 4),
            "min": min(numbers),
            "max": max(numbers),
        }, indent=2)
    except Exception as e:
        return f"Analysis error: {str(e)}"
