import uuid
from datetime import datetime, timezone

from app.database.models import Dataset, Roles, User
from app.security import create_access_token
from app.storage.local import LocalStorageBackend


def _auth_headers(db_test_session) -> dict[str, str]:
    user_id = uuid.uuid4()
    db_test_session.add(
        User(
            id=user_id,
            email="uploader@example.com",
            username="uploader",
            first_name="Upload",
            last_name="User",
            role=Roles.USER,
            created_at=datetime.now(timezone.utc),
        )
    )
    db_test_session.commit()
    access_token = create_access_token({"sub": str(user_id), "type": "access"})
    return {"Authorization": f"Bearer {access_token}"}


def test_upload_url_stores_zip_package_metadata(client, db_test_session, tmp_path):
    client.app.state.storage = LocalStorageBackend(tmp_path / "uploads")
    headers = _auth_headers(db_test_session)

    response = client.post(
        "/api/datasets/upload-url",
        headers=headers,
        json={
            "name": "Folder Dataset",
            "description": {"text": "Folder description"},
            "filenames": ["Folder_Dataset_files.zip"],
            "content_types": ["application/zip"],
            "byte_sizes": [42],
            "directory_structure": {
                "compressed": True,
                "root": "dataset",
                "paths": ["dataset/train/one.csv", "dataset/test/two.csv"],
                "archive_path": "Folder_Dataset_files.zip",
                "manifest": {"source": "browser-selection"},
            },
        },
    )

    assert response.status_code == 201
    body = response.json()
    expected_package = {
        "compressed": True,
        "representation": "zip",
        "root": "dataset",
        "paths": ["dataset/train/one.csv", "dataset/test/two.csv"],
        "archive_path": "Folder_Dataset_files.zip",
        "manifest": {
            "version": 1,
            "path_count": 2,
            "source": "browser-selection",
        },
    }
    dataset = db_test_session.get(Dataset, uuid.UUID(body["id"]))
    assert dataset.dataset_metadata["directory_structure"] == expected_package
    assert dataset.dataset_metadata["objects"][0]["original_path"] == (
        "Folder_Dataset_files.zip"
    )
    assert dataset.dataset_metadata["objects"][0]["byte_size"] == 42

    detail_response = client.get(
        "/api/datasets/get",
        params={"dataset_id": body["id"]},
        headers=headers,
    )

    assert detail_response.status_code == 200
    assert detail_response.json()["upload_package"] == expected_package


def test_upload_url_stores_multi_object_folder_metadata(
    client, db_test_session, tmp_path
):
    client.app.state.storage = LocalStorageBackend(tmp_path / "uploads")
    headers = _auth_headers(db_test_session)

    response = client.post(
        "/api/datasets/upload-url",
        headers=headers,
        json={
            "name": "Folder Dataset",
            "filenames": ["dataset/train/one.csv", "dataset/test/two.csv"],
            "content_types": ["text/csv", "text/csv"],
            "directory_structure": {
                "compressed": False,
                "root": "dataset",
                "paths": ["dataset/train/one.csv", "dataset/test/two.csv"],
            },
        },
    )

    assert response.status_code == 201
    body = response.json()
    assert [contract["original_path"] for contract in body["upload_contracts"]] == [
        "dataset/train/one.csv",
        "dataset/test/two.csv",
    ]
    dataset = db_test_session.get(Dataset, uuid.UUID(body["id"]))
    assert dataset.dataset_metadata["directory_structure"] == {
        "compressed": False,
        "representation": "multi_object",
        "root": "dataset",
        "paths": ["dataset/train/one.csv", "dataset/test/two.csv"],
        "archive_path": None,
        "manifest": {
            "version": 1,
            "path_count": 2,
            "source": "directory_structure.paths",
        },
    }


def test_upload_url_rejects_compressed_package_with_multiple_uploaded_objects(
    client, db_test_session, tmp_path
):
    client.app.state.storage = LocalStorageBackend(tmp_path / "uploads")
    headers = _auth_headers(db_test_session)

    response = client.post(
        "/api/datasets/upload-url",
        headers=headers,
        json={
            "name": "Invalid Folder Dataset",
            "filenames": ["dataset/train/one.csv", "dataset/test/two.csv"],
            "directory_structure": {
                "compressed": True,
                "paths": ["dataset/train/one.csv", "dataset/test/two.csv"],
            },
        },
    )

    assert response.status_code == 400
    assert "exactly one ZIP archive" in response.json()["detail"]


def test_upload_url_rejects_mismatched_content_type_count(
    client, db_test_session, tmp_path
):
    client.app.state.storage = LocalStorageBackend(tmp_path / "uploads")
    headers = _auth_headers(db_test_session)

    response = client.post(
        "/api/datasets/upload-url",
        headers=headers,
        json={
            "name": "Invalid Content Types",
            "filenames": ["one.csv", "two.csv"],
            "content_types": ["text/csv"],
        },
    )

    assert response.status_code == 400
    assert response.json() == {
        "detail": "Content type count must match upload target count"
    }
