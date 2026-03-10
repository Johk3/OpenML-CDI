import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.database import Base


@pytest.fixture(scope="function")
def test_engine():

    # using sqlite in memory for testing
    DATABASE_URI = "sqlite:///:memory:"

    engine = create_engine(DATABASE_URI, connect_args={"check_same_thread": False})

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
