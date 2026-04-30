"""add github_id to users

Revision ID: a1b2c3d4e5f6
Revises: f2a5b3c4d6e7
Create Date: 2026-04-23 13:25:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, Sequence[str], None] = "f2a5b3c4d6e7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.add_column(sa.Column("github_id", sa.String(length=64), nullable=True))
        batch_op.create_unique_constraint("uq_users_github_id", ["github_id"])


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.drop_constraint("uq_users_github_id", type_="unique")
        batch_op.drop_column("github_id")
