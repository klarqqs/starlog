resource "docker_network" "stellog" {
  name = "stellog-terraform"
}

resource "docker_volume" "db" {
  name = "stellog-terraform-db"
}

resource "docker_image" "postgres" {
  name         = "postgres:15-alpine"
  keep_locally = true
}

resource "docker_image" "app" {
  name         = "stellog:terraform"
  keep_locally = true

  build {
    context    = abspath("${path.module}/../..")
    dockerfile = "Dockerfile"
  }
}

resource "docker_container" "db" {
  name  = "stellog-terraform-db"
  image = docker_image.postgres.image_id

  env = [
    "POSTGRES_DB=umami",
    "POSTGRES_USER=stellog",
    "POSTGRES_PASSWORD=${var.postgres_password}",
  ]

  volumes {
    volume_name    = docker_volume.db.name
    container_path = "/var/lib/postgresql/data"
  }

  networks_advanced {
    name = docker_network.stellog.name
  }

  healthcheck {
    test     = ["CMD-SHELL", "pg_isready -U stellog -d umami"]
    interval = "5s"
    timeout  = "5s"
    retries  = 20
  }

  restart = "unless-stopped"
}

resource "docker_container" "app" {
  name  = "stellog-terraform-app"
  image = docker_image.app.image_id

  env = [
    "DATABASE_URL=postgresql://stellog:${var.postgres_password}@stellog-terraform-db:5432/umami",
    "APP_SECRET=${var.app_secret}",
    "TWO_FACTOR_ENCRYPTION_KEY=${var.two_factor_encryption_key}",
    "APP_URL=${var.app_url}",
    "DISABLE_TELEMETRY=1",
    "DISABLE_UPDATES=1",
  ]

  ports {
    internal = 3000
    external = var.host_port
  }

  networks_advanced {
    name = docker_network.stellog.name
  }

  healthcheck {
    test     = ["CMD-SHELL", "curl -fsS http://localhost:3000/api/heartbeat || exit 1"]
    interval = "5s"
    timeout  = "5s"
    retries  = 20
  }

  restart = "unless-stopped"
}
