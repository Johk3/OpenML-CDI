from pathlib import PurePosixPath


def generate_presigned_put_url(
    object_key: str,
    *,
    bucket_name: str,
    region_name: str,
    expires_in_seconds: int,
) -> str:
    import boto3

    object_name = object_key.strip()
    if not object_name:
        raise ValueError("Object key cannot be empty")

    parsed_key = PurePosixPath(object_name)
    if parsed_key.is_absolute() or ".." in parsed_key.parts:
        raise ValueError("Object key contains an invalid path")

    client = boto3.client("s3", region_name=region_name)
    return client.generate_presigned_url(
        "put_object",
        Params={"Bucket": bucket_name, "Key": str(parsed_key)},
        ExpiresIn=expires_in_seconds,
        HttpMethod="PUT",
    )
