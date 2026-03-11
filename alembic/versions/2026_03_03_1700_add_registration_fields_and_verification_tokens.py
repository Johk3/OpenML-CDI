"""add registration fields and verification tokens

Revision ID: 9a5f2d3817c4
Revises: 277f1b476ce5
Create Date: 2026-03-03 17:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "9a5f2d3817c4"
down_revision: Union[str, Sequence[str], None] = "277f1b476ce5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.add_column(sa.Column("username", sa.String(length=32), nullable=True))
        batch_op.add_column(
            sa.Column(
                "is_verified",
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            )
        )
        batch_op.create_unique_constraint("uq_users_username", ["username"])

    op.execute("UPDATE users SET username = email WHERE username IS NULL")

    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.alter_column("username", existing_type=sa.String(length=32), nullable=False)
        batch_op.alter_column("is_verified", server_default=None)

    op.create_table(
        "email_verification_tokens",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("email_verification_tokens", schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f("ix_email_verification_tokens_id"),
            ["id"],
            unique=False,
        )


def downgrade() -> None:
    with op.batch_alter_table("email_verification_tokens", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_email_verification_tokens_id"))

    op.drop_table("email_verification_tokens")

    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.drop_constraint("uq_users_username", type_="unique")
        batch_op.drop_column("is_verified")
        batch_op.drop_column("username")
