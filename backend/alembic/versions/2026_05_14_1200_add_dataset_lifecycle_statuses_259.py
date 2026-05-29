"""add dataset lifecycle statuses

Revision ID: d259addlifecycle
Revises: 7c8d9e0f1a2b
Create Date: 2026-05-14 12:00:00.000000

"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d259addlifecycle"
down_revision: Union[str, Sequence[str], None] = "7c8d9e0f1a2b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


NEW_STATUSES = (
    "PENDING_UPLOAD",
    "UPLOADED",
    "SCANNING",
    "PENDING_REVIEW",
    "INTEGRATION_FAILED",
)


def upgrade() -> None:
    """Upgrade schema."""
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return

    for status in NEW_STATUSES:
        op.execute(f"ALTER TYPE statuses ADD VALUE IF NOT EXISTS '{status}'")


def downgrade() -> None:
    """Downgrade schema."""
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return

    op.execute("ALTER TYPE statuses RENAME TO statuses_old")
    op.execute(
        "CREATE TYPE statuses AS ENUM "
        "('PENDING', 'CLAIMED', 'CONVERTED', 'QUARANTINED')"
    )
    op.execute("""
        ALTER TABLE datasets
        ALTER COLUMN status TYPE statuses
        USING (
            CASE
                WHEN status::text IN (
                    'PENDING_UPLOAD',
                    'UPLOADED',
                    'SCANNING',
                    'PENDING_REVIEW'
                ) THEN 'PENDING'
                WHEN status::text = 'INTEGRATION_FAILED' THEN 'QUARANTINED'
                ELSE status::text
            END
        )::statuses
        """)
    op.execute("DROP TYPE statuses_old")
