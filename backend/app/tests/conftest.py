import os

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

os.environ["JWT_SECRET"] = "test-jwt-secret"
os.environ["GITHUB_CLIENT_ID"] = "test-github-client-id"
os.environ["GITHUB_SECRET"] = "test-github-secret"
os.environ["GITHUB_REDIRECT"] = "http://localhost:5173/login/callback"
os.environ["AUTH_DEV_MODE_APPROVE_ALL_LOGINS"] = "true"
os.environ["COOKIE_SECURE"] = "false"
os.environ["APP_BASE_URL"] = "http://localhost:8000"

from app.database import Base  # noqa: E402


@pytest.fixture(scope="function")
def test_engine():

    # Share one in-memory SQLite database across the app thread and test thread.
    DATABASE_URI = "sqlite://"

    engine = create_engine(
        DATABASE_URI,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    # creating the database from our defined Base in app.database
    Base.metadata.create_all(engine)

    yield engine


@pytest.fixture
def db_test_session(test_engine):

    SessionLocal = sessionmaker(bind=test_engine)
    test_db = SessionLocal()
    try:
        yield test_db
    finally:
        test_db.close()
