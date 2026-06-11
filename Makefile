# HrvaDrive — common dev tasks. `make` or `make help` lists them.

.DEFAULT_GOAL := help
.PHONY: help run start stop down restart logs ps test test-analysis test-frontend

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

run: ## Build + start the whole stack
	docker compose up --build -d
	@echo "Frontend -> http://localhost:8090   (analysis :8000)"

start: ## Start the stack without rebuilding
	docker compose up -d

stop: ## Stop and remove the stack
	docker compose down

down: stop ## Alias for stop

restart: stop run ## Restart the stack

logs: ## Follow all service logs
	docker compose logs -f

ps: ## Show service status
	docker compose ps

test: test-analysis test-frontend ## Run all test suites

test-analysis: ## pytest (analysis service)
	cd analysis && .venv/bin/python -m pytest -q

test-frontend: ## vitest (frontend)
	cd frontend && npm test
