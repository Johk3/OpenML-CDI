# How to prepare the database

run `alembic upgrade head`
Make sure alembic has the same env vars, namely `DATABASE_URI`, as uvicorn gets when running, so with sops:
`sops exec-env encrypted.env "alembic upgrade head"`
or if you do not use sops:
`DATABASE_URI=sqlite:///./app_dev.db alembic upgrade head`

---

[← Back to documentation index](../index.md)
