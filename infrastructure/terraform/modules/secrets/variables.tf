variable "name_prefix" {
  description = "Prefix for Secrets Manager resources"
  type        = string
}

variable "app_secrets" {
  description = "Map of application secrets"
  type        = map(string)
  default     = {}
  sensitive   = true
}
