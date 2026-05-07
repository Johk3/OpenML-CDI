import sys
import os
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

os.environ.setdefault("JWT_SECRET", "test-jwt-secret")
os.environ.setdefault("AUTH_DEV_MODE_APPROVE_ALL_LOGINS", "true")
os.environ.setdefault("COOKIE_SECURE", "false")
