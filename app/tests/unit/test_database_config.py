from app.database import _database_connect_args


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
