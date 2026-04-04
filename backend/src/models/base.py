from abc import ABC, abstractmethod
from collections.abc import AsyncGenerator


class ModelAdapter(ABC):
    name: str
    supports_vision: bool = False

    @abstractmethod
    def stream_generate(
        self,
        system_prompt: str,
        user_prompt: str,
        image_bytes: bytes | None = None,
    ) -> AsyncGenerator[str, None]: ...

    @abstractmethod
    async def health_check(self) -> bool: ...
