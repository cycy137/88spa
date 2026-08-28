"""
Manual smoke test - no test framework/unit tests yet, per current task scope.

Uses a scripted fake LLM (implements the LLMClient protocol) to drive the
agent loop deterministically, so we can verify the control flow without a
real provider wired in.
"""

import json

from agent import ReActAgent
from spa88.src.assets.tools import DEFAULT_TOOLS


class ScriptedLLM:
    """Returns pre-scripted JSON responses in order, one per call."""

    def __init__(self, responses: list[dict]):
        self._responses = responses
        self._i = 0

    def call(self, messages: list[dict]) -> str:
        response = self._responses[self._i]
        self._i += 1
        return json.dumps(response)


def test_happy_path_with_tool_use():
    llm = ScriptedLLM(
        [
            {"thought": "I need to compute 6*7.", "action": {"tool": "calculator", "input": "6*7"}, "final_answer": None},
            {"thought": "Got the result.", "action": None, "final_answer": "6 * 7 = 42"},
        ]
    )
    agent = ReActAgent(llm=llm, tools=DEFAULT_TOOLS)
    result = agent.run("What is 6*7?")
    assert result == "6 * 7 = 42", result
    print("PASS: happy path with tool use")


def test_unknown_tool_is_recoverable():
    llm = ScriptedLLM(
        [
            {"thought": "try a bad tool", "action": {"tool": "does_not_exist", "input": "x"}, "final_answer": None},
            {"thought": "recover", "action": None, "final_answer": "recovered"},
        ]
    )
    agent = ReActAgent(llm=llm, tools=DEFAULT_TOOLS)
    result = agent.run("task")
    assert result == "recovered", result
    print("PASS: unknown tool recovers instead of crashing")


def test_malformed_json_is_recoverable():
    class BadThenGoodLLM:
        def __init__(self):
            self.calls = 0

        def call(self, messages):
            self.calls += 1
            if self.calls == 1:
                return "not json at all"
            return json.dumps({"thought": "ok now", "action": None, "final_answer": "fixed"})

    agent = ReActAgent(llm=BadThenGoodLLM(), tools=DEFAULT_TOOLS)
    result = agent.run("task")
    assert result == "fixed", result
    print("PASS: malformed JSON output recovers instead of crashing")


def test_max_iterations_default_and_stop():
    llm = ScriptedLLM(
        [{"thought": "loop", "action": {"tool": "calculator", "input": "1+1"}, "final_answer": None}] * 10
    )
    agent = ReActAgent(llm=llm, tools=DEFAULT_TOOLS)
    assert agent.max_iterations == 10
    result = agent.run("never finishes")
    assert result == "Agent stopped: reached max_iterations without producing a final answer.", result
    print("PASS: default max_iterations=10, stops gracefully when never resolved")


def test_tool_execution_error_is_recoverable():
    llm = ScriptedLLM(
        [
            {"thought": "bad expr", "action": {"tool": "calculator", "input": "not an expr!!"}, "final_answer": None},
            {"thought": "give up gracefully", "action": None, "final_answer": "could not compute"},
        ]
    )
    agent = ReActAgent(llm=llm, tools=DEFAULT_TOOLS)
    result = agent.run("task")
    assert result == "could not compute", result
    print("PASS: tool execution error becomes an observation, not a crash")


if __name__ == "__main__":
    test_happy_path_with_tool_use()
    test_unknown_tool_is_recoverable()
    test_malformed_json_is_recoverable()
    test_max_iterations_default_and_stop()
    test_tool_execution_error_is_recoverable()
    print("\nAll smoke tests passed.")
