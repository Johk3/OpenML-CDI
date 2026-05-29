"""add quarantined status to statuses enum

Revision ID: f2a5b3c4d6e7
Revises: c8c5f3ad133f
Create Date: 2026-04-13 19:45:00.000000

"""

from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "f2a5b3c4d6e7"
down_revision: Union[str, Sequence[str], None] = "c8c5f3ad133f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return

    op.execute("ALTER TYPE statuses ADD VALUE IF NOT EXISTS 'QUARANTINED'")


def downgrade() -> None:
    """Downgrade schema."""
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return

    op.execute("ALTER TYPE statuses RENAME TO statuses_old")
    op.execute("CREATE TYPE statuses AS ENUM ('PENDING', 'CLAIMED', 'CONVERTED')")
    op.execute(
        """
        ALTER TABLE datasets
        ALTER COLUMN status TYPE statuses
        USING (
            CASE
                WHEN status::text = 'QUARANTINED' THEN 'PENDING'
                ELSE status::text
            END
        )::statuses
        """
    )
    op.execute("DROP TYPE statuses_old")
