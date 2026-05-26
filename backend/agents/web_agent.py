"""
Web Agent — fetch & search the web, pays $0.0005 per call via Arc nanopayment.
"""

import httpx
from orchestrator.wallet import WalletManager

COST_PER_CALL = 0.0005  # USDC


async def fetch_url(url: str, wallet: WalletManager) -> str:
    """Fetch content from a URL. Pays nanopayment before executing."""
    paid = await wallet.pay(
        agent_name="web_agent",
        amount_usd=COST_PER_CALL,
        description=f"fetch {url[:60]}",
    )
    if not paid:
        return "Error: insufficient balance for web fetch."

    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=15) as client:
            resp = await client.get(url, headers={"User-Agent": "ArcOrchestrator/1.0"})
            resp.raise_for_status()
            # Return first 3000 chars to keep context manageable
            return resp.text[:3000]
    except Exception as e:
        return f"Error fetching {url}: {str(e)}"


async def search_web(query: str, wallet: WalletManager) -> str:
    """
    Search the web using DuckDuckGo Instant Answer API.
    Pays nanopayment before executing.
    """
    paid = await wallet.pay(
        agent_name="web_agent",
        amount_usd=COST_PER_CALL,
        description=f"search: {query[:50]}",
    )
    if not paid:
        return "Error: insufficient balance for web search."

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                "https://api.duckduckgo.com/",
                params={"q": query, "format": "json", "no_html": 1},
            )
            resp.raise_for_status()
            data = resp.json()
            abstract = data.get("AbstractText", "")
            related = [r.get("Text", "") for r in data.get("RelatedTopics", [])[:5]]
            result = abstract or " | ".join(related) or "No results found."
            return result[:2000]
    except Exception as e:
        return f"Error searching '{query}': {str(e)}"
