import uuid
from datetime import datetime, timezone

from app.database.models import Dataset, Roles, Statuses, User
from app.security import create_access_token


def test_quarantined_dataset_cannot_be_moved_to_processing(client, db_test_session):
    uploader_id = uuid.uuid4()
    dataset_id = uuid.uuid4()
    db_test_session.add(
        User(
            id=uploader_id,
            email="uploader@example.com",
            username="uploader",
            first_name="Upload",
            last_name="User",
            role=Roles.EXPERT,
            created_at=datetime.now(timezone.utc),
        )
    )
    db_test_session.add(
        Dataset(
            id=dataset_id,
            title="Quarantined dataset",
            owner_id=uploader_id,
            dataset_metadata={
                "filename": "infected.csv",
                "malware_scan": {
                    "status": "infected",
                    "engine": "signature",
                    "signature": "EICAR-Test-File",
                },
            },
            status=Statuses.QUARANTINED,
        )
    )
    db_test_session.commit()
    access_token = create_access_token({"sub": str(uploader_id), "type": "access"})

    response = client.post(
        "/api/datasets/status",
        params={"dataset_id": str(dataset_id), "status": "claimed"},
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert response.status_code == 409
    assert response.json() == {"detail": "Quarantined datasets cannot be processed"}
    db_test_session.refresh(db_test_session.get(Dataset, dataset_id))
    assert db_test_session.get(Dataset, dataset_id).status == Statuses.QUARANTINED
