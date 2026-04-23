variable "aws_region" {
  description = "AWS region for resources"
  type        = string
}

variable "name_prefix" {
  description = "Prefix for naming AWS resources"
  type        = string
}

variable "vpc_cidr" {
  description = "CIDR block for VPC"
  type        = string
}

variable "container_image" {
  description = "Container image URI for Slimbooks app"
  type        = string
}

variable "container_port" {
  description = "Container port exposed by Slimbooks"
  type        = number
  default     = 3002
}

variable "acm_certificate_arn" {
  description = "ACM certificate ARN for ALB HTTPS listener"
  type        = string
}

variable "db_name" {
  description = "PostgreSQL database name"
  type        = string
}

variable "db_username" {
  description = "PostgreSQL master username"
  type        = string
}

variable "db_password" {
  description = "PostgreSQL master password"
  type        = string
  sensitive   = true
}

variable "app_secrets" {
  description = "Map of secret keys/values for app runtime"
  type        = map(string)
  default     = {}
  sensitive   = true
}
