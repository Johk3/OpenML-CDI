from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class UploadTarget:
    storage_key: str
    local_path: Path | None
