"""
Orchestrator Brain — Claude sebagai reasoning engine.
Menggunakan AsyncAnthropic agar tidak blocking event loop.
"""

import anthropic
from orchestrator.wallet import WalletManager
from agents.web_agent import fetch_url, search_web
from agents.compute_agent import run_calculation, analyze_data

DEFAULT_MODEL = "claude-opus-4-6"

TOOLS = [
    {
        "name": "search_web",
        "description": "Search the web for information on a topic. Costs $0.0005 USDC per call.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search query"},
            },
            "required": ["query"],
        },
    },
    {
        "name": "fetch_url",
        "description": "Fetch the content of a specific URL. Costs $0.0005 USDC per call.",
        "input_schema": {
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "The URL to fetch"},
            },
            "required": ["url"],
        },
    },
    {
        "name": "run_calculation",
        "description": "Evaluate a math expression or computation. Costs $0.0002 USDC per call.",
        "input_schema": {
            "type": "object",
            "properties": {
                "expression": {
                    "type": "string",
                    "description": "Python math expression to evaluate (e.g. '2 ** 10', 'sqrt(144)')",
                },
            },
            "required": ["expression"],
        },
    },
    {
        "name": "analyze_data",
        "description": "Run statistical analysis on a list of numbers. Costs $0.0002 USDC per call.",
        "input_schema": {
            "type": "object",
            "properties": {
                "data": {
                    "type": "array",
                    "items": {"type": "number"},
                    "description": "List of numbers to analyze",
                },
            },
            "required": ["data"],
        },
    },
]

SYSTEM_PROMPT = """You are an intelligent agent orchestrator running on Arc Testnet.
You have access to tools that each cost a small USDC nanopayment to execute on Arc.
Be efficient — only call tools you actually need to complete the user's task.
After gathering all needed information, synthesize a clear, complete answer.
Always mention which tools you used and what they cost in total."""


class OrchestratorBrain:
    def __init__(self, wallet: WalletManager, anthropic_api_key: str, model: str = DEFAULT_MODEL):
        # Bug fix 1: pakai AsyncAnthropic agar tidak blocking event loop
        self.client = anthropic.AsyncAnthropic(api_key=anthropic_api_key)
        self.wallet = wallet
        # Bug fix 2: model diteruskan dari request, tidak hardcoded
        self.model = model if model else DEFAULT_MODEL
        self.steps: list[dict] = []

    async def run(self, task: str):
        """
        Run a task using Claude with tool use.
        Yields step-by-step events for SSE streaming to the frontend.
        """
        self.steps = []
        messages = [{"role": "user", "content": task}]

        yield {"type": "start", "message": f"Analyzing task with {self.model}..."}

        while True:
            # Bug fix 1: await async call — tidak blocking
            response = await self.client.messages.create(
                model=self.model,
                max_tokens=4096,
                system=SYSTEM_PROMPT,
                tools=TOOLS,
                messages=messages,
            )

            tool_calls = []
            text_parts = []

            for block in response.content:
                if block.type == "text":
                    text_parts.append(block.text)
                elif block.type == "tool_use":
                    tool_calls.append(block)

            if text_parts:
                yield {"type": "thinking", "message": " ".join(text_parts)}

            # Claude selesai — tidak ada tool call lagi
            if response.stop_reason == "end_turn" or not tool_calls:
                final_text = " ".join(text_parts) if text_parts else "Task complete."
                yield {
                    "type": "done",
                    "message": final_text,
                    "wallet": self.wallet.get_summary(),
                    "steps": self.steps,
                }
                return

            # Eksekusi tool calls — masing-masing bayar via nanopayment
            tool_results = []
            for tool_call in tool_calls:
                tool_name = tool_call.name
                tool_input = tool_call.input

                yield {
                    "type": "tool_call",
                    "tool": tool_name,
                    "input": tool_input,
                    "message": f"Calling {tool_name}...",
                }

                result = await self._execute_tool(tool_name, tool_input)
                self.steps.append({"tool": tool_name, "input": tool_input, "output": result[:500]})

                yield {
                    "type": "tool_result",
                    "tool": tool_name,
                    "result": result[:500],
                    "wallet": self.wallet.get_summary(),
                }

                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": tool_call.id,
                    "content": result,
                })

            messages.append({"role": "assistant", "content": response.content})
            messages.append({"role": "user", "content": tool_results})

    async def _execute_tool(self, name: str, inputs: dict) -> str:
        if name == "search_web":
            return await search_web(inputs["query"], self.wallet)
        elif name == "fetch_url":
            return await fetch_url(inputs["url"], self.wallet)
        elif name == "run_calculation":
            return await run_calculation(inputs["expression"], self.wallet)
        elif name == "analyze_data":
            return await analyze_data(inputs["data"], self.wallet)
        return f"Unknown tool: {name}"
