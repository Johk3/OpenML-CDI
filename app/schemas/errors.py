from pydantic import BaseModel, Field


class ErrorBody(BaseModel):
    code: str
    message: str
    fields: dict[str, list[str]] | None = None


class ErrorResponse(BaseModel):
    error: ErrorBody = Field(...)
