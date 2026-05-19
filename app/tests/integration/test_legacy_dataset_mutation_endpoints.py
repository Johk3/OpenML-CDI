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
    title: str = "Original title",
    checksums: list[str] | None = None,
    issue_url: str = "https://github.com/openml/original/issues/1",
) -> uuid.UUID:
    dataset_id = uuid.uuid4()
    metadata = {"name": title}
    if checksums is not None:
        metadata["checksums"] = checksums
    db_test_session.add(
        Dataset(
            id=dataset_id,
            title=title,
            owner_id=owner.id,
            dataset_metadata=metadata,
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


def test_metadata_endpoint_rejects_duplicate_dataset_name_for_same_owner(
    client, db_test_session
):
    owner = _add_user(db_test_session)
    existing_dataset_id = _add_dataset(
        db_test_session,
        owner=owner,
        title=" Existing Dataset ",
        issue_url="",
    )
    dataset_id = _add_dataset(
        db_test_session,
        owner=owner,
        title="Editable dataset",
        issue_url="",
    )

    response = client.post(
        "/api/datasets/metadata",
        headers=_headers(owner),
        params={"dataset_id": str(dataset_id)},
        json={"name": "existing dataset", "description": "Duplicate rename"},
    )

    assert response.status_code == 409
    assert response.json() == {"detail": "Dataset with this name already exists"}
    db_test_session.refresh(db_test_session.get(Dataset, dataset_id))
    db_test_session.refresh(db_test_session.get(Dataset, existing_dataset_id))
    changed_dataset = db_test_session.get(Dataset, dataset_id)
    existing_dataset = db_test_session.get(Dataset, existing_dataset_id)
    assert changed_dataset.title == "Editable dataset"
    assert changed_dataset.dataset_metadata == {"name": "Editable dataset"}
    assert existing_dataset.title == " Existing Dataset "


def test_metadata_endpoint_rejects_duplicate_title_and_checksum_for_same_owner(
    client, db_test_session
):
    owner = _add_user(db_test_session)
    existing_dataset_id = _add_dataset(
        db_test_session,
        owner=owner,
        title=" Existing Dataset ",
        checksums=[" ABC123 "],
        issue_url="",
    )
    dataset_id = _add_dataset(
        db_test_session,
        owner=owner,
        title="Editable dataset",
        checksums=["abc123"],
        issue_url="",
    )

    response = client.post(
        "/api/datasets/metadata",
        headers=_headers(owner),
        params={"dataset_id": str(dataset_id)},
        json={"name": "existing dataset", "description": "Duplicate rename"},
    )

    assert response.status_code == 409
    assert response.json() == {
        "detail": "Dataset with this name and checksum already exists"
    }
    db_test_session.refresh(db_test_session.get(Dataset, dataset_id))
    db_test_session.refresh(db_test_session.get(Dataset, existing_dataset_id))
    changed_dataset = db_test_session.get(Dataset, dataset_id)
    existing_dataset = db_test_session.get(Dataset, existing_dataset_id)
    assert changed_dataset.title == "Editable dataset"
    assert changed_dataset.dataset_metadata == {
        "name": "Editable dataset",
        "checksums": ["abc123"],
    }
    assert existing_dataset.title == " Existing Dataset "


def test_metadata_endpoint_allows_same_title_when_checksum_differs(
    client, db_test_session
):
    owner = _add_user(db_test_session)
    _add_dataset(
        db_test_session,
        owner=owner,
        title=" Existing Dataset ",
        checksums=["abc123"],
        issue_url="",
    )
    dataset_id = _add_dataset(
        db_test_session,
        owner=owner,
        title="Editable dataset",
        checksums=["def456"],
        issue_url="",
    )

    response = client.post(
        "/api/datasets/metadata",
        headers=_headers(owner),
        params={"dataset_id": str(dataset_id)},
        json={"name": "existing dataset", "description": "Allowed rename"},
    )

    assert response.status_code == 200
    db_test_session.refresh(db_test_session.get(Dataset, dataset_id))
    changed_dataset = db_test_session.get(Dataset, dataset_id)
    assert changed_dataset.title == "existing dataset"
    assert changed_dataset.dataset_metadata == {
        "name": "existing dataset",
        "checksums": ["def456"],
        "description": "Allowed rename",
    }


def test_metadata_endpoint_preserves_storage_derived_metadata_for_owner(
    client, db_test_session
):
    owner = _add_user(db_test_session)
    dataset_id = _add_dataset(db_test_session, owner=owner, issue_url="")
    original_sha256 = "a" * 64
    original_md5 = "b" * 32

    dataset = db_test_session.get(Dataset, dataset_id)
    dataset.dataset_metadata = {
        "name": "Original title",
        "url": f"https://app.example/datasets/{dataset_id}",
        "distribution": [
            {
                "@type": "cr:FileObject",
                "@id": "original.csv",
                "name": "original.csv",
                "contentUrl": f"https://app.example/api/datasets/{dataset_id}/download",
                "contentSize": "128 B",
                "sha256": original_sha256,
                "md5": original_md5,
                "encodingFormat": "text/csv",
            }
        ],
    }
    db_test_session.commit()

    response = client.post(
        "/api/datasets/metadata",
        headers=_headers(owner),
        params={"dataset_id": str(dataset_id)},
        json={
            "name": "Owner updated title",
            "description": "Owner updated description",
            "url": "https://evil.example/datasets/other",
            "distribution": [
                {
                    "@type": "cr:FileObject",
                    "@id": "other.csv",
                    "name": "renamed.csv",
                    "contentUrl": "https://evil.example/download",
                    "contentSize": "1 B",
                    "sha256": "c" * 64,
                    "md5": "d" * 32,
                    "encodingFormat": "text/plain",
                }
            ],
        },
    )

    assert response.status_code == 200
    db_test_session.refresh(dataset)
    assert dataset.title == "Owner updated title"
    assert dataset.dataset_metadata["description"] == "Owner updated description"
    assert (
        dataset.dataset_metadata["url"] == f"https://app.example/datasets/{dataset_id}"
    )

    distribution = dataset.dataset_metadata["distribution"][0]
    assert distribution["@id"] == "original.csv"
    assert (
        distribution["contentUrl"]
        == f"https://app.example/api/datasets/{dataset_id}/download"
    )
    assert distribution["contentSize"] == "128 B"
    assert distribution["sha256"] == original_sha256
    assert distribution["md5"] == original_md5
    assert distribution["name"] == "renamed.csv"
    assert distribution["encodingFormat"] == "text/plain"


def test_metadata_endpoint_preserves_distribution_when_owner_submits_empty_list(
    client, db_test_session
):
    owner = _add_user(db_test_session)
    dataset_id = _add_dataset(db_test_session, owner=owner, issue_url="")

    dataset = db_test_session.get(Dataset, dataset_id)
    dataset.dataset_metadata = {
        "name": "Original title",
        "distribution": [
            {
                "@type": "cr:FileObject",
                "@id": "original.csv",
                "name": "original.csv",
                "contentUrl": f"https://app.example/api/datasets/{dataset_id}/download",
                "contentSize": "128 B",
                "sha256": "a" * 64,
            }
        ],
    }
    db_test_session.commit()

    response = client.post(
        "/api/datasets/metadata",
        headers=_headers(owner),
        params={"dataset_id": str(dataset_id)},
        json={"distribution": []},
    )

    assert response.status_code == 200
    db_test_session.refresh(dataset)
    assert dataset.dataset_metadata["distribution"] == [
        {
            "@type": "cr:FileObject",
            "@id": "original.csv",
            "name": "original.csv",
            "contentUrl": f"https://app.example/api/datasets/{dataset_id}/download",
            "contentSize": "128 B",
            "sha256": "a" * 64,
        }
    ]


def test_metadata_endpoint_matches_owner_distribution_by_name_not_position(
    client, db_test_session
):
    owner = _add_user(db_test_session)
    dataset_id = _add_dataset(db_test_session, owner=owner, issue_url="")

    dataset = db_test_session.get(Dataset, dataset_id)
    dataset.dataset_metadata = {
        "name": "Original title",
        "distribution": [
            {
                "@type": "cr:FileObject",
                "@id": "a.csv",
                "name": "a.csv",
                "contentUrl": (
                    f"https://app.example/api/datasets/{dataset_id}/download/a"
                ),
                "contentSize": "10 B",
                "sha256": "a" * 64,
            },
            {
                "@type": "cr:FileObject",
                "@id": "b.csv",
                "name": "b.csv",
                "contentUrl": (
                    f"https://app.example/api/datasets/{dataset_id}/download/b"
                ),
                "contentSize": "20 B",
                "sha256": "b" * 64,
            },
        ],
    }
    db_test_session.commit()

    response = client.post(
        "/api/datasets/metadata",
        headers=_headers(owner),
        params={"dataset_id": str(dataset_id)},
        json={
            "distribution": [
                {
                    "@type": "cr:FileObject",
                    "@id": "wrong-b.csv",
                    "name": "b.csv",
                    "description": "Updated B",
                    "contentUrl": "https://evil.example/b",
                    "contentSize": "1 B",
                    "sha256": "c" * 64,
                },
                {
                    "@type": "cr:FileObject",
                    "@id": "wrong-a.csv",
                    "name": "a.csv",
                    "description": "Updated A",
                    "contentUrl": "https://evil.example/a",
                    "contentSize": "2 B",
                    "sha256": "d" * 64,
                },
            ]
        },
    )

    assert response.status_code == 200
    db_test_session.refresh(dataset)

    first, second = dataset.dataset_metadata["distribution"]
    assert first["@id"] == "a.csv"
    assert first["name"] == "a.csv"
    assert first["description"] == "Updated A"
    assert (
        first["contentUrl"]
        == f"https://app.example/api/datasets/{dataset_id}/download/a"
    )
    assert first["contentSize"] == "10 B"
    assert first["sha256"] == "a" * 64

    assert second["@id"] == "b.csv"
    assert second["name"] == "b.csv"
    assert second["description"] == "Updated B"
    assert (
        second["contentUrl"]
        == f"https://app.example/api/datasets/{dataset_id}/download/b"
    )
    assert second["contentSize"] == "20 B"
    assert second["sha256"] == "b" * 64


def test_metadata_endpoint_generates_protected_metadata_from_upload_objects_for_owner(
    client, db_test_session
):
    owner = _add_user(db_test_session)
    dataset_id = _add_dataset(db_test_session, owner=owner, issue_url="")
    original_sha256 = "e" * 64

    dataset = db_test_session.get(Dataset, dataset_id)
    dataset.dataset_metadata = {
        "name": "Original title",
        "objects": [
            {
                "original_path": "uploaded.csv",
                "object_key": f"ready/{dataset_id}/uploaded.csv",
                "byte_size": 512,
                "checksum": f"sha256:{original_sha256}",
            }
        ],
    }
    db_test_session.commit()

    response = client.post(
        "/api/datasets/metadata",
        headers=_headers(owner),
        params={"dataset_id": str(dataset_id)},
        json={
            "url": "https://evil.example/datasets/other",
            "distribution": [
                {
                    "@type": "cr:FileObject",
                    "@id": "other.csv",
                    "name": "uploaded.csv",
                    "contentUrl": "https://evil.example/download",
                    "contentSize": "1 B",
                    "sha256": "f" * 64,
                }
            ],
        },
    )

    assert response.status_code == 200
    db_test_session.refresh(dataset)
    assert (
        dataset.dataset_metadata["url"]
        == f"http://localhost:8000/datasets/{dataset_id}"
    )

    distribution = dataset.dataset_metadata["distribution"][0]
    assert distribution["@id"] == "uploaded.csv"
    assert (
        distribution["contentUrl"]
        == f"http://localhost:8000/api/datasets/{dataset_id}/download"
    )
    assert distribution["contentSize"] == "512 B"
    assert distribution["sha256"] == original_sha256


def test_metadata_endpoint_allows_expert_to_update_storage_derived_metadata(
    client, db_test_session
):
    owner = _add_user(db_test_session)
    expert = _add_user(db_test_session, role=Roles.EXPERT)
    dataset_id = _add_dataset(db_test_session, owner=owner, issue_url="")

    dataset = db_test_session.get(Dataset, dataset_id)
    dataset.dataset_metadata = {
        "name": "Original title",
        "url": f"https://app.example/datasets/{dataset_id}",
        "distribution": [
            {
                "@type": "cr:FileObject",
                "@id": "original.csv",
                "name": "original.csv",
                "contentUrl": f"https://app.example/api/datasets/{dataset_id}/download",
                "contentSize": "128 B",
                "sha256": "a" * 64,
                "md5": "b" * 32,
            }
        ],
    }
    db_test_session.commit()

    response = client.post(
        "/api/datasets/metadata",
        headers=_headers(expert),
        params={"dataset_id": str(dataset_id)},
        json={
            "url": "https://expert.example/datasets/canonical",
            "distribution": [
                {
                    "@type": "cr:FileObject",
                    "@id": "expert.csv",
                    "name": "expert.csv",
                    "contentUrl": "https://expert.example/download",
                    "contentSize": "256 B",
                    "sha256": "c" * 64,
                    "md5": "d" * 32,
                }
            ],
        },
    )

    assert response.status_code == 200
    db_test_session.refresh(dataset)
    assert (
        dataset.dataset_metadata["url"] == "https://expert.example/datasets/canonical"
    )

    distribution = dataset.dataset_metadata["distribution"][0]
    assert distribution["@id"] == "expert.csv"
    assert distribution["contentUrl"] == "https://expert.example/download"
    assert distribution["contentSize"] == "256 B"
    assert distribution["sha256"] == "c" * 64
    assert distribution["md5"] == "d" * 32


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
