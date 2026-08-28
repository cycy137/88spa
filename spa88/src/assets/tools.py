"""
Tool interface and mock tool implementations.

Each Tool exposes a name/description (fed into the LLM prompt so it knows
what's available) and a `run` method that never raises - execution errors
are caught and turned into an observation string so a single bad tool call
can't crash the agent loop.
"""

from dataclasses import dataclass
from typing import Callable


@dataclass
class Tool:
    name: str
    description: str
    func: Callable[[str], str]

    def run(self, tool_input: str) -> str:
        try:
            return self.func(tool_input)
        except Exception as e:  # noqa: BLE001 - intentionally broad, tool errors become observations
            return f"Error executing tool '{self.name}': {e}"


# ---- Mock tools (placeholders until real integrations are wired in) ----

def _calculator(input_str: str) -> str:
    allowed_chars = set("0123456789+-*/(). ")
    if not set(input_str) <= allowed_chars:
        raise ValueError(f"Unsupported characters in expression: {input_str!r}")
    result = eval(input_str, {"__builtins__": {}}, {})  # noqa: S307 - restricted charset above
    return str(result)


def _search(input_str: str) -> str:
    return f"[mock] Search results for '{input_str}': no real search backend wired in yet."


DEFAULT_TOOLS: list[Tool] = [
    Tool(
        name="calculator",
        description="Evaluate a basic arithmetic expression (+ - * / parentheses). Input: the expression as a string, e.g. '2 * (3 + 4)'.",
        func=_calculator,
    ),
    Tool(
        name="search",
        description="Search for information on a topic. Input: a search query string. (Mock implementation - returns placeholder results.)",
        func=_search,
    ),
]
