"""
Configuration management — loads settings from .env, environment, and config.yaml.

Usage:
    from secureflex_intel.config import settings
    key = settings.companies_house_api_key
    data_dir = settings.data_dir
"""

import os
from pathlib import Path

# Resolve package root (one level up from this file's parent)
PACKAGE_ROOT = Path(__file__).resolve().parent.parent

# Try to load .env from package root
_env_path = PACKAGE_ROOT / ".env"
if _env_path.exists():
    with open(_env_path) as _f:
        for _line in _f:
            _line = _line.strip()
            if _line and not _line.startswith("#") and "=" in _line:
                _key, _, _value = _line.partition("=")
                os.environ.setdefault(_key.strip(), _value.strip())


class Settings:
    """Centralised settings object. Reads from environment with defaults."""

    # ── API Keys ─────────────────────────────────────────────────────────
    @property
    def companies_house_api_key(self) -> str:
        return os.environ.get("COMPANIES_HOUSE_API_KEY", "")

    @property
    def openai_api_key(self) -> str:
        return os.environ.get("OPENAI_API_KEY", "")

    @property
    def anthropic_api_key(self) -> str:
        return os.environ.get("ANTHROPIC_API_KEY", "")

    # ── Paths ────────────────────────────────────────────────────────────
    @property
    def data_dir(self) -> Path:
        """Root data directory for all outputs."""
        return PACKAGE_ROOT / "data"

    @property
    def output_dir(self) -> Path:
        return self.data_dir / "output"

    @property
    def tenders_dir(self) -> Path:
        return self.output_dir / "tenders"

    @property
    def prospects_dir(self) -> Path:
        return self.output_dir / "prospects"

    @property
    def signals_dir(self) -> Path:
        return self.output_dir / "signals"

    @property
    def briefs_dir(self) -> Path:
        return self.output_dir / "briefs"

    @property
    def pipeline_path(self) -> Path:
        """Path to the growth system's pipeline CSV (if connected)."""
        env = os.environ.get("PIPELINE_CSV_PATH", "")
        if env:
            return Path(env)
        # Default: look in sibling secureflex-growth directory
        sibling = PACKAGE_ROOT.parent / "secureflex-growth" / "data" / "pipeline_master.csv"
        if sibling.exists():
            return sibling
        # Fallback: local data dir
        return self.data_dir / "pipeline_master.csv"

    # ── Tender Radar Settings ────────────────────────────────────────────
    @property
    def tender_region(self) -> str:
        return os.environ.get("TENDER_REGION", "all")

    @property
    def tender_days_back(self) -> int:
        return int(os.environ.get("TENDER_DAYS_BACK", "30"))

    @property
    def tender_min_score(self) -> int:
        return int(os.environ.get("TENDER_MIN_SCORE", "45"))

    # ── FTS Settings ─────────────────────────────────────────────────────
    @property
    def fts_days_back(self) -> int:
        return int(os.environ.get("FTS_DAYS_BACK", "30"))

    # ── Auto-Scan Scheduler Settings ─────────────────────────────────────
    @property
    def scan_interval_hours(self) -> int:
        return int(os.environ.get("SCAN_INTERVAL_HOURS", "6"))

    @property
    def auto_scan(self) -> bool:
        return os.environ.get("AUTO_SCAN", "true").lower() in ("1", "true", "yes")

    # ── Prospector Settings ──────────────────────────────────────────────
    @property
    def prospector_region(self) -> str:
        return os.environ.get("PROSPECTOR_REGION", "london")

    @property
    def prospector_max_results(self) -> int:
        return int(os.environ.get("PROSPECTOR_MAX_RESULTS", "200"))

    # ── JWT Authentication ───────────────────────────────────────────────
    @property
    def jwt_secret_key(self) -> str:
        return os.environ.get("JWT_SECRET_KEY", "secureflex-default-jwt-secret-change-me")

    @property
    def jwt_expiry_hours(self) -> int:
        return int(os.environ.get("JWT_EXPIRY_HOURS", "24"))

    # ── SMTP / Email Digest ──────────────────────────────────────────────
    @property
    def smtp_host(self) -> str:
        return os.environ.get("SMTP_HOST", "")

    @property
    def smtp_port(self) -> int:
        return int(os.environ.get("SMTP_PORT", "587"))

    @property
    def smtp_user(self) -> str:
        return os.environ.get("SMTP_USER", "")

    @property
    def smtp_password(self) -> str:
        return os.environ.get("SMTP_PASSWORD", "")

    @property
    def digest_recipients(self) -> str:
        return os.environ.get("DIGEST_RECIPIENTS", "")

    @property
    def digest_enabled(self) -> bool:
        return os.environ.get("DIGEST_ENABLED", "false").lower() in ("1", "true", "yes")

    @property
    def digest_day(self) -> str:
        return os.environ.get("DIGEST_DAY", "monday")

    @property
    def digest_hour(self) -> int:
        return int(os.environ.get("DIGEST_HOUR", "8"))

    # ── General ──────────────────────────────────────────────────────────
    @property
    def debug(self) -> bool:
        return os.environ.get("DEBUG", "").lower() in ("1", "true", "yes")

    def ensure_dirs(self):
        """Create all output directories if they don't exist."""
        for d in [self.output_dir, self.tenders_dir, self.prospects_dir,
                  self.signals_dir, self.briefs_dir]:
            d.mkdir(parents=True, exist_ok=True)


# Singleton instance
settings = Settings()
