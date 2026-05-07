from app.config import StorageSettings
from app.storage.errors import StorageUnavailableError
from app.storage.s3 import S3StorageBackend


class RecordingS3Client:
    def __init__(self):
        self.calls: list[tuple[str, dict]] = []

    def put_object(self, **kwargs):
        self.calls.append(("put_object", kwargs))
        return {"ETag": '"etag"'}

    def get_object(self, **kwargs):
        self.calls.append(("get_object", kwargs))
        return {"Body": _Body(b"stored bytes")}

    def head_object(self, **kwargs):
        self.calls.append(("head_object", kwargs))
        return {
            "ContentLength": 12,
            "ContentType": "text/csv",
            "ETag": '"etag"',
        }

    def delete_object(self, **kwargs):
        self.calls.append(("delete_object", kwargs))
        return {}

    def copy_object(self, **kwargs):
        self.calls.append(("copy_object", kwargs))
        return {"CopyObjectResult": {"ETag": '"copied"'}}

    def generate_presigned_url(self, ClientMethod, Params, ExpiresIn):
        self.calls.append(
            (
                "generate_presigned_url",
                {
                    "ClientMethod": ClientMethod,
                    "Params": Params,
                    "ExpiresIn": ExpiresIn,
                },
            )
        )
        return f"https://signed.example/{ClientMethod}"

    def create_multipart_upload(self, **kwargs):
        self.calls.append(("create_multipart_upload", kwargs))
        return {"UploadId": "upload-1"}

    def complete_multipart_upload(self, **kwargs):
        self.calls.append(("complete_multipart_upload", kwargs))
        return {"ETag": '"complete"'}

    def abort_multipart_upload(self, **kwargs):
        self.calls.append(("abort_multipart_upload", kwargs))
        return {}


class _Body:
    def __init__(self, data: bytes):
        self.data = data
        self.closed = False

    def read(self, _size=-1):
        return self.data

    def close(self):
        self.closed = True


class FailingPutClient(RecordingS3Client):
    def put_object(self, **kwargs):
        raise RuntimeError("s3 unavailable")


def _settings() -> StorageSettings:
    return StorageSettings(
        backend="s3",
        s3_bucket="datasets",
        s3_region="eu-west-1",
        s3_endpoint="http://localhost:9000",
    )


def test_create_upload_target_uses_quarantine_prefix_without_local_path():
    backend = S3StorageBackend(_settings(), client=RecordingS3Client())

    target = backend.create_upload_target("../folder/data.csv", prefix="batch")

    assert target.storage_key == "quarantine/batch/folder/data.csv"
    assert target.local_path is None


def test_write_bytes_raises_storage_error_without_local_fallback():
    backend = S3StorageBackend(_settings(), client=FailingPutClient())

    try:
        backend.write_bytes("quarantine/batch/data.csv", b"a,b\n1,2\n")
    except StorageUnavailableError as error:
        assert "write object" in str(error)
    else:
        raise AssertionError("S3 write should fail instead of falling back to local")


def test_metadata_exists_download_and_delete_use_configured_bucket():
    client = RecordingS3Client()
    backend = S3StorageBackend(_settings(), client=client)

    metadata = backend.get_metadata("datasets/final/data.csv")
    assert backend.object_exists("datasets/final/data.csv") is True
    assert backend.create_download_url("datasets/final/data.csv", expires_seconds=30)
    backend.delete("datasets/final/data.csv")

    assert metadata.bucket == "datasets"
    assert metadata.storage_key == "datasets/final/data.csv"
    assert metadata.byte_size == 12
    assert metadata.content_type == "text/csv"
    assert metadata.etag == "etag"
    assert (
        "delete_object",
        {"Bucket": "datasets", "Key": "datasets/final/data.csv"},
    ) in client.calls


def test_promote_from_quarantine_copies_then_deletes_source():
    client = RecordingS3Client()
    backend = S3StorageBackend(_settings(), client=client)

    backend.promote_from_quarantine(
        "quarantine/batch/data.csv", "datasets/final/data.csv"
    )

    assert client.calls[0] == (
        "copy_object",
        {
            "Bucket": "datasets",
            "CopySource": {"Bucket": "datasets", "Key": "quarantine/batch/data.csv"},
            "Key": "datasets/final/data.csv",
        },
    )
    assert client.calls[1] == (
        "delete_object",
        {"Bucket": "datasets", "Key": "quarantine/batch/data.csv"},
    )


def test_multipart_lifecycle_uses_s3_contracts():
    client = RecordingS3Client()
    backend = S3StorageBackend(_settings(), client=client)

    upload = backend.initiate_multipart_upload(
        "quarantine/batch/large.csv", content_type="text/csv"
    )
    part_url = backend.create_multipart_part_url(
        "quarantine/batch/large.csv",
        upload_id=upload.upload_id,
        part_number=1,
        expires_seconds=60,
    )
    backend.complete_multipart_upload(
        "quarantine/batch/large.csv",
        upload_id=upload.upload_id,
        parts=[{"part_number": 1, "etag": "abc"}],
    )
    backend.abort_multipart_upload("quarantine/batch/large.csv", upload.upload_id)

    assert upload.upload_id == "upload-1"
    assert part_url == "https://signed.example/upload_part"
    assert (
        "create_multipart_upload",
        {
            "Bucket": "datasets",
            "Key": "quarantine/batch/large.csv",
            "ContentType": "text/csv",
        },
    ) in client.calls
