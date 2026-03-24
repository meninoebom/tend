from pydantic import BaseModel, field_validator


class ChatMessage(BaseModel):
    role: str
    content: str

    @field_validator("role")
    @classmethod
    def validate_role(cls, v: str) -> str:
        if v not in ("user", "assistant"):
            raise ValueError("role must be 'user' or 'assistant'")
        return v


class ChatRequest(BaseModel):
    message: str
    history: list[ChatMessage] = []

    @field_validator("message")
    @classmethod
    def validate_message(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("message cannot be empty")
        return v.strip()

    @field_validator("history")
    @classmethod
    def truncate_history(cls, v: list[ChatMessage]) -> list[ChatMessage]:
        return v[-20:] if len(v) > 20 else v


class ChatResponse(BaseModel):
    reply: str
    context_summary: str
