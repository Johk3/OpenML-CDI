from fastapi import FastAPI
from .config import Settings
from .storage import get_storage_backend

# from .routers import x
from fastapi.staticfiles import StaticFiles

app = FastAPI()
# app.include_router(x.router) add page

app.mount(
    "/assets", StaticFiles(directory="app/static/assets", html=True), name="static"
)
app.mount("/", StaticFiles(directory="app/static", html=True), name="static")


@app.on_event("startup")
def initialize_storage() -> None:
    # Build storage dependencies once and expose them via app.state.
    settings = Settings.from_env()
    app.state.settings = settings
    app.state.storage = get_storage_backend(settings)
