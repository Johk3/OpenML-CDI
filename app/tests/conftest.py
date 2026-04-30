import os

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from app.database import Base

os.environ.setdefault("JWT_SECRET", "test-jwt-secret")
os.environ.setdefault("GITHUB_CLIENT_ID", "test-github-client-id")
os.environ.setdefault("GITHUB_SECRET", "test-github-secret")
os.environ.setdefault("GITHUB_REDIRECT", "http://localhost:5173/login/callback")
os.environ.setdefault("AUTH_DEV_MODE_APPROVE_ALL_LOGINS", "true")


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
