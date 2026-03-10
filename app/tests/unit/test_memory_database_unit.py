import pytest
from app.database import models


@pytest.mark.order(1)  # this test needs to run before the second one
def test_test_session(db_test_session):
    test_user = models.User(
        email="test@test.com",
        password_hash="testhash",
        first_name="John",
        last_name="Doe",
    )
    db_test_session.add(test_user)
    db_test_session.commit()
    db_test_session.refresh(test_user)

    query_user = (
        db_test_session.query(models.User)
        .filter(models.User.id == test_user.id)
        .first()
    )

    assert query_user == test_user
    assert query_user.email == "test@test.com"
    assert query_user.first_name == "John"
    assert query_user.last_name == "Doe"


@pytest.mark.order(2)
def test_fixture_rollback(db_test_session):

    query_user = (
        db_test_session.query(models.User)
        .filter(models.User.email == "test@test.com")
        .first()
    )

    assert query_user is None
