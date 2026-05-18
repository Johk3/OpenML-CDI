import uuid
from datetime import datetime, timezone

from app.database.models import Dataset, Roles, Statuses, User
from app.security import create_access_token


def _add_user(db_test_session, *, role: Roles = Roles.USER) -> User:
    user_id = uuid.uuid4()
    user = User(
        id=user_id,
        email=f"{user_id}@example.com",
        username=f"user-{str(user_id)[:8]}",
        first_name="Dataset",
        last_name="Owner",
        role=role,
        created_at=datetime.now(timezone.utc),
    )
    db_test_session.add(user)
    db_test_session.commit()
    return user


def _headers(user: User) -> dict[str, str]:
    access_token = create_access_token({"sub": str(user.id), "type": "access"})
    return {"Authorization": f"Bearer {access_token}"}


def _add_dataset(
    db_test_session,
    *,
    owner: User,
    issue_url: str = "https://github.com/openml/original/issues/1",
) -> uuid.UUID:
    dataset_id = uuid.uuid4()
    db_test_session.add(
        Dataset(
            id=dataset_id,
            title="Original title",
            owner_id=owner.id,
            dataset_metadata={"name": "Original title"},
            status=Statuses.PENDING_UPLOAD,
            issue_url=issue_url,
        )
    )
    db_test_session.commit()
    return dataset_id


def test_legacy_create_endpoint_cannot_create_dataset_with_unsafe_fields(
    client, db_test_session
):
    owner = _add_user(db_test_session)

    response = client.post(
        "/api/datasets/create",
        headers=_headers(owner),
        json={
            "title": "Bypassed dataset",
            "dataset_metadata": {"name": "Bypassed dataset"},
            "owner_id": str(owner.id),
            "status": "approved",
            "issue_url": "https://github.com/openml/bypass/issues/99",
        },
    )

    assert response.status_code in {404, 405}
    assert db_test_session.query(Dataset).count() == 0


def test_legacy_owner_endpoint_cannot_transfer_dataset_owner(client, db_test_session):
    owner = _add_user(db_test_session)
    new_owner = _add_user(db_test_session)
    dataset_id = _add_dataset(db_test_session, owner=owner)

    response = client.post(
        "/api/datasets/owner",
        headers=_headers(owner),
        params={"dataset_id": str(dataset_id), "owner_id": str(new_owner.id)},
    )

    assert response.status_code in {404, 405}
    db_test_session.refresh(db_test_session.get(Dataset, dataset_id))
    assert db_test_session.get(Dataset, dataset_id).owner_id == owner.id


def test_legacy_issue_url_endpoint_cannot_overwrite_dataset_issue_url(
    client, db_test_session
):
    owner = _add_user(db_test_session)
    dataset_id = _add_dataset(db_test_session, owner=owner)

    response = client.post(
        "/api/datasets/issue_url",
        headers=_headers(owner),
        params={
            "dataset_id": str(dataset_id),
            "issue_url": "https://github.com/openml/changed/issues/2",
        },
    )

    assert response.status_code in {404, 405}
    db_test_session.refresh(db_test_session.get(Dataset, dataset_id))
    assert (
        db_test_session.get(Dataset, dataset_id).issue_url
        == "https://github.com/openml/original/issues/1"
    )


def test_legacy_title_endpoint_cannot_mutate_dataset_title(client, db_test_session):
    owner = _add_user(db_test_session)
    dataset_id = _add_dataset(db_test_session, owner=owner)

    response = client.post(
        "/api/datasets/title",
        headers=_headers(owner),
        params={"dataset_id": str(dataset_id), "title": "Changed title"},
    )

    assert response.status_code in {404, 405}
    db_test_session.refresh(db_test_session.get(Dataset, dataset_id))
    assert db_test_session.get(Dataset, dataset_id).title == "Original title"


def test_metadata_endpoint_allows_owner_to_update_metadata_and_title(
    client, db_test_session
):
    owner = _add_user(db_test_session)
    dataset_id = _add_dataset(db_test_session, owner=owner, issue_url="")

    response = client.post(
        "/api/datasets/metadata",
        headers=_headers(owner),
        params={"dataset_id": str(dataset_id)},
        json={"name": "Updated title", "description": "Updated description"},
    )

    assert response.status_code == 200
    db_test_session.refresh(db_test_session.get(Dataset, dataset_id))
    dataset = db_test_session.get(Dataset, dataset_id)
    assert dataset.title == "Updated title"
    assert dataset.dataset_metadata["name"] == "Updated title"
    assert dataset.dataset_metadata["description"] == "Updated description"


def test_metadata_endpoint_allows_expert_to_update_metadata_and_title(
    client, db_test_session
):
    owner = _add_user(db_test_session)
    expert = _add_user(db_test_session, role=Roles.EXPERT)
    dataset_id = _add_dataset(db_test_session, owner=owner, issue_url="")

    response = client.post(
        "/api/datasets/metadata",
        headers=_headers(expert),
        params={"dataset_id": str(dataset_id)},
        json={"name": "Expert updated title"},
    )

    assert response.status_code == 200
    db_test_session.refresh(db_test_session.get(Dataset, dataset_id))
    dataset = db_test_session.get(Dataset, dataset_id)
    assert dataset.title == "Expert updated title"
    assert dataset.dataset_metadata["name"] == "Expert updated title"


def test_metadata_endpoint_rejects_other_users(client, db_test_session):
    owner = _add_user(db_test_session)
    other_user = _add_user(db_test_session)
    dataset_id = _add_dataset(db_test_session, owner=owner, issue_url="")

    response = client.post(
        "/api/datasets/metadata",
        headers=_headers(other_user),
        params={"dataset_id": str(dataset_id)},
        json={"name": "Unauthorized title"},
    )

    assert response.status_code == 403
    db_test_session.refresh(db_test_session.get(Dataset, dataset_id))
    dataset = db_test_session.get(Dataset, dataset_id)
    assert dataset.title == "Original title"
    assert dataset.dataset_metadata == {"name": "Original title"}
