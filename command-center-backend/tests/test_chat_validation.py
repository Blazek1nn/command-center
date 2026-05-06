from __future__ import annotations

import pytest
from pydantic import ValidationError

from command_center.api.chat import ChatRequest


def test_chat_request_strips_null_bytes() -> None:
    with pytest.raises(ValidationError):
        ChatRequest(message="oi\x00there")


def test_chat_request_max_length() -> None:
    with pytest.raises(ValidationError):
        ChatRequest(message="x" * 10_001)


def test_chat_request_min_length() -> None:
    with pytest.raises(ValidationError):
        ChatRequest(message="")


def test_chat_request_strips_control_chars() -> None:
    # \x07 (BEL) é control char; deve ser strip-ado, mas \n preservado
    req = ChatRequest(message="oi\x07\nworld")
    assert req.message == "oi\nworld"


def test_chat_request_history_max() -> None:
    with pytest.raises(ValidationError):
        ChatRequest(
            message="oi",
            history=[{"role": "ceo", "content": "x"} for _ in range(21)],
        )


def test_chat_request_normal_message() -> None:
    req = ChatRequest(message="Olá! Como vai? 😀")
    assert req.message == "Olá! Como vai? 😀"
