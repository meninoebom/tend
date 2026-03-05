from fastapi import Request
from fastapi.responses import JSONResponse


class AppError(Exception):
    def __init__(self, code: str, message: str, status_code: int = 400):
        self.code = code
        self.message = message
        self.status_code = status_code


class NotFoundError(AppError):
    def __init__(self, message: str = "Resource not found"):
        super().__init__(code="not_found", message=message, status_code=404)


class ForbiddenError(AppError):
    def __init__(self, message: str = "Access denied"):
        super().__init__(code="forbidden", message=message, status_code=403)


class DomainLimitReachedError(AppError):
    def __init__(self, limit: int = 5):
        super().__init__(
            code="domain_limit_reached",
            message=f"Maximum of {limit} domains allowed",
            status_code=422,
        )


async def app_error_handler(_request: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={"code": exc.code, "message": exc.message},
    )
