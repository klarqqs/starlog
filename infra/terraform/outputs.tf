output "app_url" {
  value = var.app_url
}

output "database_volume" {
  value = docker_volume.db.name
}

output "host_port" {
  value = var.host_port
}
