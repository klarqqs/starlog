COMPOSE=docker compose -f infra/compose/docker-compose.yml --env-file .env
.PHONY: up down logs psql test-db test-api
up:
	$(COMPOSE) up -d
down:
	$(COMPOSE) down
logs:
	$(COMPOSE) logs -f
psql:
	$(COMPOSE) exec db psql -U $${POSTGRES_USER:-postgres} -d starlog
test-db:
	bash infra/scripts/test-db.sh
test-api:
	bash infra/scripts/test-api.sh
