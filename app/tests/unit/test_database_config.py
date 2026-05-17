from app.database import _database_connect_args
from app.database import models


def test_database_connect_args_keep_sqlite_thread_check_disabled():
    assert _database_connect_args("sqlite:///app/data/app_dev.db") == {
        "check_same_thread": False
    }


def test_database_connect_args_omit_sqlite_options_for_postgres():
    assert (
        _database_connect_args(
            "postgresql+psycopg://openml:openml@database:5432/openml"
        )
        == {}
    )


def test_token_family_name_is_not_bound_to_non_unique_refresh_token_family_id():
    assert not models.TokenFamilyName.__table__.c.family_id.foreign_keys
