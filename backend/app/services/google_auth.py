"""
Google Workspace OAuth 2.0 Client
Supports dual mode: operates cleanly in local mode when credentials.json is absent,
and handles OAuth authentication with automatic token refresh when credentials are provided.
"""
from pathlib import Path
from typing import Optional, Any
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from ..config import settings
import logging

logger = logging.getLogger(__name__)

SCOPES = [
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/tasks",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/drive.readonly",
]


def is_google_configured() -> bool:
    """Check if credentials.json or token.json exists."""
    creds_path = Path(settings.google_credentials_path)
    token_path = Path(settings.google_token_path)
    return creds_path.exists() or token_path.exists()


def get_google_credentials() -> Optional[Credentials]:
    """Retrieve or refresh Google OAuth credentials. Returns None if not configured."""
    creds_path = Path(settings.google_credentials_path)
    token_path = Path(settings.google_token_path)

    if not creds_path.exists() and not token_path.exists():
        logger.info("Google OAuth credentials.json not found; operating in standalone local mode.")
        return None

    creds = None
    if token_path.exists():
        try:
            creds = Credentials.from_authorized_user_file(str(token_path), SCOPES)
        except Exception as e:
            logger.warning(f"Failed to read existing token.json: {e}")

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            try:
                creds.refresh(Request())
                token_path.write_text(creds.to_json())
            except Exception as e:
                logger.error(f"Failed to refresh Google token: {e}")
                return None
        elif creds_path.exists():
            try:
                flow = InstalledAppFlow.from_client_secrets_file(str(creds_path), SCOPES)
                creds = flow.run_local_server(port=0)
                token_path.write_text(creds.to_json())
            except Exception as e:
                logger.error(f"Failed to execute Google OAuth flow: {e}")
                return None

    return creds
