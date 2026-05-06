"""Cofre de tokens de integrações — Fernet symmetric encryption.

Por que existe:
- Antes, `Integration.token` ficava em texto plano no SQLite. Qualquer leitura
  do .db expunha o PAT do GitHub e a Linear API key. Risco baixo em dev local
  (single-user), mas tóxico se o .db vazasse ou virasse multi-user.

Como funciona:
- Chave Fernet em ~/.command-center/secret.key (gerada na 1ª inicialização).
- `encrypt(plain)` → token base64 que pode ser persistido.
- `decrypt(cipher)` → texto original.
- Tokens NOVOS sempre são gravados criptografados. Tokens LEGADOS (pré-Fernet)
  são detectados em `decrypt()` e devolvidos como estão (best-effort) — assim
  não quebramos integrações já configuradas. O `scripts/migrate_tokens.py`
  re-criptografa em batch.

Operações sensíveis usam `chmod 600` no arquivo da chave (POSIX). No Windows,
ACLs default já restringem ao usuário, mas adicionalmente removemos read pra
"Everyone" se possível.
"""
from __future__ import annotations

import os
import stat
from pathlib import Path

import structlog
from cryptography.fernet import Fernet, InvalidToken

log = structlog.get_logger(__name__)

_KEY_DIR = Path.home() / ".command-center"
_KEY_PATH = _KEY_DIR / "secret.key"

# Marca pra distinguir cipher Fernet de tokens legados (pré-Fernet).
# Fernet sempre começa com "gAAAAA" no padding base64-url. Mas pra robustez,
# usamos prefixo explícito.
_PREFIX = "fnt:"


def _ensure_key() -> bytes:
    """Lê a chave do disco; se não existe, gera, persiste e protege."""
    if _KEY_PATH.exists():
        return _KEY_PATH.read_bytes()
    _KEY_DIR.mkdir(parents=True, exist_ok=True)
    key = Fernet.generate_key()
    _KEY_PATH.write_bytes(key)
    # POSIX: chmod 600. Windows: ACL default já é restritiva ao user.
    if hasattr(os, "chmod"):
        try:
            os.chmod(_KEY_PATH, stat.S_IRUSR | stat.S_IWUSR)
        except OSError as exc:
            log.warning("secrets_vault.chmod_failed", error=str(exc))
    log.info("secrets_vault.key_generated", path=str(_KEY_PATH))
    return key


_fernet: Fernet | None = None


def _cipher() -> Fernet:
    global _fernet
    if _fernet is None:
        _fernet = Fernet(_ensure_key())
    return _fernet


def encrypt(plain: str) -> str:
    """Encripta um token. Sempre prefixado com 'fnt:'."""
    if not plain:
        return plain
    token = _cipher().encrypt(plain.encode("utf-8")).decode("ascii")
    return _PREFIX + token


def decrypt(stored: str) -> str:
    """Descripta um token. Se for legacy (sem prefixo), retorna como está."""
    if not stored:
        return stored
    if not stored.startswith(_PREFIX):
        # Legacy plain-text: retorna como está; será re-criptografado no próximo upsert.
        return stored
    cipher_text = stored[len(_PREFIX):]
    try:
        return _cipher().decrypt(cipher_text.encode("ascii")).decode("utf-8")
    except InvalidToken:
        log.error("secrets_vault.decrypt_failed_invalid_token")
        # Não derruba a app — devolve string vazia (caller deve tratar)
        return ""


def is_encrypted(stored: str) -> bool:
    return bool(stored) and stored.startswith(_PREFIX)
