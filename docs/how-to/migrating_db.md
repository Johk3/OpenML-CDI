# How to prepare the database

run `cd backend && alembic upgrade head`
Make sure alembic has the same env vars, namely `DATABASE_URI`, as uvicorn gets when running, so with sops:
`sops exec-env encrypted.env "sh -c 'cd backend && alembic upgrade head'"`
or if you do not use sops:
`cd backend && DATABASE_URI=sqlite:///./app_dev.db alembic upgrade head`

---

[← Back to documentation index](../index.md)
