from fastapi import FastAPI
from .database import engine, Base

# from .routers import x
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

Base.metadata.create_all(bind=engine)

app = FastAPI()
# app.include_router(x.router) add page

app.mount("/static", StaticFiles(directory="app/frontend"), name="static")


@app.get("/")
async def read_index():
    return FileResponse("app/frontend/index.html")
