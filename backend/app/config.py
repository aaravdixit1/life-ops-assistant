from typing import Optional
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

# Root directory of the repository
ROOT_DIR = Path(__file__).resolve().parent.parent.parent
ENV_PATH = ROOT_DIR / ".env" if (ROOT_DIR / ".env").exists() else ROOT_DIR / ".env.example"


class Settings(BaseSettings):
    # Database
    database_url: str = "postgresql://lifeops:lifeops_dev@localhost:5432/lifeops"

    # Canvas LMS (Any University or canvas.instructure.com)
    canvas_base_url: str = "https://canvas.instructure.com"
    canvas_ics_url: Optional[str] = None

    # Optional User Profile Defaults (can also be configured in /setup UI)
    user_name: str = ""
    user_city: str = ""
    user_timezone: str = "America/New_York"

    # AI Models (Dual Model Router)
    gemini_api_key: Optional[str] = None
    gemini_model: str = "gemini-2.5-flash"
    local_model_base_url: str = "http://localhost:11434/v1"
    local_model_name: str = "llama3.2:3b"
    cloud_llm_enabled: bool = True
    exam_mode: bool = False

    # Google Workspace (Optional Cloud Sync)
    google_credentials_path: str = "backend/credentials.json"
    google_token_path: str = "backend/token.json"

    # App Config
    backend_port: int = 8000
    frontend_port: int = 3000
    log_level: str = "INFO"

    model_config = SettingsConfigDict(
        env_file=str(ENV_PATH),
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
