"""Application settings (pydantic-settings). All secrets come from the environment."""

from __future__ import annotations

import json
from functools import lru_cache
from typing import Annotated, Literal

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class ConfigError(RuntimeError):
    """Raised at startup when required production configuration is missing."""


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore", case_sensitive=False
    )

    env: Literal["dev", "test", "prod"] = "dev"

    # --- datastores -------------------------------------------------------------------------
    database_url: str = "sqlite+aiosqlite:///./dev.db"
    db_pool_size: int = 5
    db_max_overflow: int = 5
    qdrant_url: str = ""
    qdrant_api_key: SecretStr = SecretStr("")

    # --- providers --------------------------------------------------------------------------
    groq_api_key: SecretStr = SecretStr("")
    sarvam_api_key: SecretStr = SecretStr("")
    firebase_service_account_json: SecretStr = SecretStr("")
    require_verified_email: bool = True

    llm_chat_model: str = "llama-3.3-70b-versatile"
    llm_fast_model: str = "llama-3.1-8b-instant"
    llm_vision_model: str = "meta-llama/llama-4-scout-17b-16e-instruct"
    llm_timeout_seconds: float = 30.0
    llm_stream_max_seconds: float = 120.0
    llm_max_output_tokens: int = 1024

    embedding_model: str = "BAAI/bge-small-en-v1.5"
    embedding_dim: int = 384
    fastembed_cache_path: str = ""

    # --- HTTP -------------------------------------------------------------------------------
    cors_origins: Annotated[list[str], NoDecode] = Field(default_factory=list)
    cors_origin_regex: str = ""
    allowed_hosts: Annotated[list[str], NoDecode] = Field(default_factory=lambda: ["*"])
    max_json_bytes: int = 1_000_000
    max_upload_bytes: int = 10 * 1024 * 1024

    # --- chat / RAG -------------------------------------------------------------------------
    chat_history_default: int = 10
    chat_history_max: int = 20
    rag_memory_k: int = 4
    rag_doc_k: int = 5
    rag_score_threshold: float = 0.55  # bge-small: related ~0.65+, unrelated ~0.45
    pdf_max_pages: int = 200
    doc_max_chars: int = 500_000
    doc_max_chunks: int = 600

    # --- rate limits (per user) -------------------------------------------------------------
    rl_chat_per_min: int = 20
    rl_upload_per_min: int = 5
    rl_ocr_stt_per_min: int = 10
    rl_generate_per_min: int = 10
    daily_quota: int = 300

    # --- rate limits (per client IP, shared through the database) ----------------------------
    rl_ip_enabled: bool = True
    rl_ip_v1_per_min: int = 120  # coarse pre-auth limiter on /v1/*
    rl_ip_public_per_min: int = 30  # /readyz, docs, unknown paths (everything unauthenticated)
    # Number of trusted reverse proxies in front of the app (Cloud Run = 1). The client IP is the
    # entry that many positions from the RIGHT of X-Forwarded-For; anything to its left is
    # client-controlled and ignored.
    trusted_proxy_hops: int = Field(default=1, ge=0, le=10)

    # --- add-from-URL fetcher ---------------------------------------------------------------
    url_fetch_max_bytes: int = 10 * 1024 * 1024
    url_fetch_timeout_seconds: float = 15.0  # whole fetch incl. DNS and redirects
    url_fetch_max_redirects: int = 3

    # --- observability (optional) -----------------------------------------------------------
    sentry_dsn: SecretStr = SecretStr("")
    sentry_traces_sample_rate: float = Field(default=0.0, ge=0.0, le=1.0)

    @field_validator("cors_origins", "allowed_hosts", mode="before")
    @classmethod
    def _split_list(cls, v: object) -> object:
        if isinstance(v, str):
            s = v.strip()
            if not s:
                return []
            if s.startswith("["):
                return json.loads(s)
            return [p.strip() for p in s.split(",") if p.strip()]
        return v

    @field_validator("cors_origins")
    @classmethod
    def _no_wildcard_origin(cls, v: list[str]) -> list[str]:
        if any(o.strip() == "*" for o in v):
            raise ValueError("CORS_ORIGINS must be an explicit allow-list; '*' is not permitted")
        return [o.rstrip("/") for o in v]

    @model_validator(mode="after")
    def _check_prod(self) -> Settings:
        if self.env != "prod":
            return self
        required = {
            "DATABASE_URL": self.database_url
            if "dev.db" not in self.database_url and "sqlite" not in self.database_url
            else "",
            "QDRANT_URL": self.qdrant_url,
            "GROQ_API_KEY": self.groq_api_key.get_secret_value(),
            "FIREBASE_SERVICE_ACCOUNT_JSON": self.firebase_service_account_json.get_secret_value(),
            "CORS_ORIGINS": ",".join(self.cors_origins),
        }
        missing = [k for k, v in required.items() if not v]
        if missing:
            raise ConfigError("Missing required production configuration: " + ", ".join(missing))
        return self

    @property
    def is_prod(self) -> bool:
        return self.env == "prod"


@lru_cache
def get_settings() -> Settings:
    return Settings()
