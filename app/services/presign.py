from pathlib import Path


def generate_presigned_put_url(
    filename: str,
    *,
    bucket_name: str,
    region_name: str,
    expires_in_seconds: int,
) -> str:
    import boto3

    object_name = Path(filename).name.strip()
    if not object_name:
        raise ValueError("Filename cannot be empty")

    client = boto3.client("s3", region_name=region_name)
    return client.generate_presigned_url(
        "put_object",
        Params={"Bucket": bucket_name, "Key": object_name},
        ExpiresIn=expires_in_seconds,
        HttpMethod="PUT",
    )
