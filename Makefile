.PHONY: up down logs pull-models dev-backend dev-frontend typecheck lint

up:
	docker compose up --build -d

down:
	docker compose down

logs:
	docker compose logs -f

pull-models:
	ollama pull qwen3-coder:30b
	ollama pull qwen2.5-coder:7b
	ollama pull qwen2.5vl:7b

dev-backend:
	cd backend && uv run uvicorn src.main:app --reload --host 0.0.0.0 --port 7001

dev-frontend:
	cd frontend && pnpm dev

typecheck:
	cd frontend && pnpm typecheck
	cd backend && uv run mypy src

lint:
	cd backend && uv run ruff check src
	cd frontend && pnpm eslint src --ext ts,tsx
