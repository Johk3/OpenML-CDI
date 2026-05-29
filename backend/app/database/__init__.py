from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URI = os.environ.get("DATABASE_URI")
if not DATABASE_URI:
    print("Fallback database URI used")
    DATABASE_URI = "sqlite:///app/data/app_dev.db"


def _database_connect_args(database_uri: str) -> dict[str, bool]:
    if make_url(database_uri).get_backend_name() == "sqlite":
        return {"check_same_thread": False}
    return {}


engine = create_engine(DATABASE_URI, connect_args=_database_connect_args(DATABASE_URI))
SessionLocal = sessionmaker(bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
