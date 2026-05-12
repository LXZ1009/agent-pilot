from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Any

from langchain_openai import ChatOpenAI
from pydantic import SecretStr


@dataclass(frozen=True)
class DeepAgentsModelConfig:
    model: str
    api_key: str | None = None
    base_url: str | None = None
    temperature: float = 0.2
    extra_body: dict[str, Any] | None = None
    disable_streaming: str | bool | None = None
    parallel_tool_calls: bool | None = None

    @classmethod
    def from_env(cls) -> "DeepAgentsModelConfig":
        model = os.getenv("AGENT_PILOT_MODEL", "openai:gpt-5.4")
        api_key = os.getenv("OPENAI_API_KEY")
        base_url = os.getenv("OPENAI_BASE_URL") or None
        if (model.startswith("openai:") or base_url) and not api_key:
            raise RuntimeError("OPENAI_API_KEY is required for real DeepAgents execution.")
        return cls(
            model=model,
            api_key=api_key,
            base_url=base_url,
            temperature=float(os.getenv("AGENT_PILOT_TEMPERATURE", "0.2")),
            extra_body=_json_env("AGENT_PILOT_OPENAI_EXTRA_BODY_JSON"),
            disable_streaming=(
                "tool_calling"
                if os.getenv("AGENT_PILOT_DISABLE_STREAMING_TOOL_CALLING", "true").lower()
                in {"1", "true", "yes"}
                else None
            ),
            parallel_tool_calls=_optional_bool_env("AGENT_PILOT_PARALLEL_TOOL_CALLS"),
        )

    def to_model(self) -> str | ChatOpenAI:
        if not self.base_url:
            return self.model

        kwargs: dict[str, Any] = {
            "model": self.model.removeprefix("openai:"),
            "api_key": SecretStr(self.api_key or ""),
            "base_url": self.base_url,
            "temperature": self.temperature,
        }
        if self.extra_body is not None:
            kwargs["extra_body"] = self.extra_body
        if self.disable_streaming is not None:
            kwargs["disable_streaming"] = self.disable_streaming
        if self.parallel_tool_calls is not None:
            kwargs["parallel_tool_calls"] = self.parallel_tool_calls
        return ChatOpenAI(**kwargs)


def get_model() -> str | ChatOpenAI:
    return DeepAgentsModelConfig.from_env().to_model()


def _json_env(name: str) -> dict[str, Any] | None:
    value = os.getenv(name)
    if not value:
        return None
    parsed = json.loads(value)
    if not isinstance(parsed, dict):
        raise RuntimeError(f"{name} must be a JSON object.")
    return parsed


def _optional_bool_env(name: str) -> bool | None:
    value = os.getenv(name)
    if value is None:
        return None
    return value.lower() in {"1", "true", "yes"}
