COMPOSE=docker compose -f infra/compose/docker-compose.yml --env-file .env
.PHONY: up down logs psql test-db test-api operator e2e
up:
	$(COMPOSE) up -d --build
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
# Create the first SCF operator: make operator EMAIL=you@example.org PASSWORD='12+ characters'
operator:
	@test -n "$(EMAIL)" -a -n "$(PASSWORD)" || { echo "Usage: make operator EMAIL=... PASSWORD=..."; exit 1; }
	$(COMPOSE) run --rm api node scripts/create-operator.js "$(EMAIL)" "$(PASSWORD)"
e2e:
	bash infra/scripts/e2e.sh
