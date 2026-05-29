"""add expert review statuses

Revision ID: 7c8d9e0f1a2b
Revises: a1b2c3d4e5f6, 1bbe86749126, 5a9c1e2d3f4b
Create Date: 2026-05-14 22:30:00.000000

"""

from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "7c8d9e0f1a2b"
down_revision: Union[str, Sequence[str], None] = (
    "a1b2c3d4e5f6",
    "1bbe86749126",
    "5a9c1e2d3f4b",
)
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return

    op.execute("ALTER TYPE statuses ADD VALUE IF NOT EXISTS 'APPROVED'")
    op.execute("ALTER TYPE statuses ADD VALUE IF NOT EXISTS 'REJECTED'")
    op.execute("ALTER TYPE statuses ADD VALUE IF NOT EXISTS 'PUBLISHED'")


def downgrade() -> None:
    """Downgrade schema."""
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return

    op.execute("ALTER TYPE statuses RENAME TO statuses_old")
    op.execute(
        """
        CREATE TYPE statuses AS ENUM (
            'PENDING',
            'CLAIMED',
            'CONVERTED',
            'QUARANTINED'
        )
        """
    )
    op.execute(
        """
        ALTER TABLE datasets
        ALTER COLUMN status TYPE statuses
        USING (
            CASE
                WHEN status::text IN ('APPROVED', 'REJECTED', 'PUBLISHED') THEN 'PENDING'
                ELSE status::text
            END
        )::statuses
        """
    )
    op.execute("DROP TYPE statuses_old")
