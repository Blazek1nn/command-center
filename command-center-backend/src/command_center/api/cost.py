"""GET /api/cost-estimate — estima custo de uma mensagem antes de enviar.

Heurística leve baseada em chars→tokens (1 token ≈ 4 chars em PT/EN). Usa preços
oficiais Anthropic (USD por 1M tokens). Não chama LLM — resposta em <1ms.
"""
from __future__ import annotations

from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/api", tags=["cost"])


# Preços em USD por 1M tokens (input / output). Fonte: anthropic.com/pricing.
# Atualize se Anthropic mudar a tabela.
_PRICING: dict[str, tuple[float, float]] = {
    "opus": (15.0, 75.0),
    "sonnet": (3.0, 15.0),
    "haiku": (0.80, 4.0),
}


class CostEstimate(BaseModel):
    model: Literal["opus", "sonnet", "haiku"]
    input_tokens_estimate: int
    output_tokens_estimate: int
    cost_usd: float
    cost_brl: float  # aproximação 1 USD = 5 BRL pra leitura rápida
    note: str


def _estimate_tokens(text: str) -> int:
    """Aproximação grosseira: 1 token ≈ 4 chars (PT/EN). Adequado pra cost preview."""
    return max(1, len(text) // 4)


@router.get("/cost-estimate", response_model=CostEstimate)
async def estimate(
    text: str = "",
    model: Literal["opus", "sonnet", "haiku"] = "sonnet",
    expected_output_chars: int = 800,
) -> CostEstimate:
    """Estima custo de uma única chamada Claude com `text` como input.

    Para o fluxo /chat completo (Manager + Workers + Reporter), multiplique
    por ~3-5x dependendo do tamanho do plano.
    """
    in_tokens = _estimate_tokens(text)
    out_tokens = _estimate_tokens("x" * expected_output_chars)
    in_price, out_price = _PRICING[model]
    cost_usd = (in_tokens * in_price + out_tokens * out_price) / 1_000_000

    note = (
        "Estimativa só do Manager. Se houver workers + reporter, "
        "multiplique por ~3-5x."
    )

    return CostEstimate(
        model=model,
        input_tokens_estimate=in_tokens,
        output_tokens_estimate=out_tokens,
        cost_usd=round(cost_usd, 6),
        cost_brl=round(cost_usd * 5.0, 4),
        note=note,
    )
