from pydantic_settings import BaseSettings, SettingsConfigDict


class Config(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Ollama: http://localhost:11434 when running on host,
    #         http://host.docker.internal:11434 when inside Docker (set in docker-compose.yml)
    ollama_base_url: str = "http://localhost:11434"
    ollama_default_model: str = "qwen2.5-coder:32b"

    # Optional cloud keys (empty string = disabled)
    openai_api_key: str = ""
    anthropic_api_key: str = ""
    gemini_api_key: str = ""
    openrouter_api_key: str = ""

    # Backend
    host: str = "0.0.0.0"
    port: int = 7001
    db_path: str = "./data/openstitch.db"
    log_level: str = "info"


config = Config()
