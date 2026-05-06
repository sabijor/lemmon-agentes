.PHONY: dev backend frontend lint type-check test

dev:
	@echo "Subindo backend (porta 8000) + frontend (porta 3000)..."
	(cd dashboard && npm run dev) & uvicorn api.main:app --reload --port 8000

backend:
	uvicorn api.main:app --reload --port 8000

frontend:
	cd dashboard && npm run dev

lint:
	ruff check . --fix

type-check:
	mypy agentes/ core/ api/

test:
	pytest tests/ -v
