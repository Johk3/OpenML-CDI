from fastapi import FastAPI
from .database import engine, Base
from .config import Settings
from .storage import get_storage_backend

# from .routers import x
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

Base.metadata.create_all(bind=engine)

app = FastAPI()
# app.include_router(x.router) add page

app.mount("/static", StaticFiles(directory="app/static"), name="static")


@app.on_event("startup")
def initialize_storage() -> None:
    # Build storage dependencies once and expose them via app.state.
    settings = Settings.from_env()
    app.state.settings = settings
    app.state.storage = get_storage_backend(settings)


@app.get("/")
async def read_index():
    return FileResponse("app/static/index.html")
