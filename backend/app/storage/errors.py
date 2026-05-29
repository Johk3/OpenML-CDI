class StorageError(RuntimeError):
    """Base class for storage backend failures."""


class StorageConfigurationError(StorageError):
    """Raised when storage settings are incomplete or invalid."""


class StorageCredentialError(StorageError):
    """Raised when storage credentials are rejected or unavailable."""


class StorageBucketError(StorageError):
    """Raised when the configured bucket/container is missing or inaccessible."""


class StorageObjectNotFoundError(StorageError, FileNotFoundError):
    """Raised when an object does not exist."""


class StorageUnavailableError(StorageError):
    """Raised when the storage service cannot complete an operation."""


class StorageVerificationError(StorageError):
    """Raised when uploaded object verification fails."""
