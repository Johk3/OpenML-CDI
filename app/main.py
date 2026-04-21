from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from .config import Settings
from .services.email import build_email_sender
from .storage import get_storage_backend

from .routers import auth, dataset, user
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173"
    ],  # TODO: move cors and allowed origins to config
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory="app/static"), name="static")
app.include_router(dataset.router, prefix="/api")
app.include_router(user.router, prefix="/api")
app.include_router(auth.router, prefix="/api")
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
    if not hasattr(app.state, "email_sender"):
        app.state.email_sender = build_email_sender(settings)


@app.exception_handler(RequestValidationError)
async def request_validation_exception_handler(_request, exc: RequestValidationError):
    fields: dict[str, list[str]] = {}
    for error in exc.errors():
        location = error.get("loc", [])
        field_name = location[-1] if location else "body"
        if field_name == "body":
            field_name = "body"
        fields.setdefault(str(field_name), []).append(error["msg"])

    return JSONResponse(
        status_code=400,
        content={
            "error": {
                "code": "validation_error",
                "message": "Invalid request body",
                "fields": fields,
            }
        },
    )


@app.get("/")
async def read_index():
    return FileResponse("app/static/index.html")
