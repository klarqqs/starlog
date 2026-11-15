variable "app_secret" {
  type        = string
  sensitive   = true
  description = "APP_SECRET. openssl rand -hex 32. Rotating it signs every session out."

  validation {
    condition     = length(var.app_secret) >= 32
    error_message = "app_secret must be at least 32 characters."
  }
}

variable "two_factor_encryption_key" {
  type        = string
  sensitive   = true
  description = "TWO_FACTOR_ENCRYPTION_KEY. openssl rand -hex 32. Rotating it makes existing two-factor secrets unreadable."

  validation {
    condition     = length(var.two_factor_encryption_key) >= 32
    error_message = "two_factor_encryption_key must be at least 32 characters."
  }
}

variable "postgres_password" {
  type        = string
  sensitive   = true
  description = "Password for the stellog database role created with this volume."

  validation {
    condition     = can(regex("^[A-Za-z0-9_-]{16,}$", var.postgres_password))
    error_message = "postgres_password must be at least 16 URL-safe characters so it can sit in DATABASE_URL."
  }
}

variable "app_url" {
  type        = string
  description = "Public origin of this install, including https and no trailing path."
  default     = "http://127.0.0.1:3001"

  validation {
    condition     = can(regex("^https?://[^/]+$", var.app_url))
    error_message = "app_url must be an origin, for example https://stats.example."
  }
}

variable "host_port" {
  type        = number
  description = "Host port for the app. 3001 avoids a dev server already bound to 3000."
  default     = 3001
}
