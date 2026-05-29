"""rename roles to user and expert

Revision ID: 5a9c1e2d3f4b
Revises: 31b8c2e7f9d1
Create Date: 2026-04-26 12:00:00.000000

"""

from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "5a9c1e2d3f4b"
down_revision: Union[str, Sequence[str], None] = "31b8c2e7f9d1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("ALTER TYPE roles RENAME TO roles_old")
        op.execute("CREATE TYPE roles AS ENUM ('EXPERT', 'USER')")
        op.execute("ALTER TABLE users ALTER COLUMN role DROP DEFAULT")
        op.execute(
            """
            ALTER TABLE users
            ALTER COLUMN role TYPE roles
            USING (
                CASE
                    WHEN role::text IN ('EXPERT', 'expert') THEN 'EXPERT'
                    WHEN role::text IN ('UPLOADER', 'uploader') THEN 'USER'
                    ELSE 'USER'
                END
            )::roles
            """
        )
        op.execute("DROP TYPE roles_old")
        return

    op.execute(
        """
        UPDATE users
        SET role = CASE
            WHEN role IN ('EXPERT', 'expert') THEN 'EXPERT'
            WHEN role IN ('UPLOADER', 'uploader') THEN 'USER'
            ELSE role
        END
        """
    )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("ALTER TYPE roles RENAME TO roles_old")
        op.execute("CREATE TYPE roles AS ENUM ('EXPERT', 'UPLOADER')")
        op.execute("ALTER TABLE users ALTER COLUMN role DROP DEFAULT")
        op.execute(
            """
            ALTER TABLE users
            ALTER COLUMN role TYPE roles
            USING (
                CASE
                    WHEN role::text IN ('EXPERT', 'expert') THEN 'EXPERT'
                    WHEN role::text IN ('USER', 'user') THEN 'UPLOADER'
                    ELSE 'UPLOADER'
                END
            )::roles
            """
        )
        op.execute("DROP TYPE roles_old")
        return

    op.execute(
        """
        UPDATE users
        SET role = CASE
            WHEN role IN ('EXPERT', 'expert') THEN 'EXPERT'
            WHEN role IN ('USER', 'user') THEN 'UPLOADER'
            ELSE role
        END
        """
    )
