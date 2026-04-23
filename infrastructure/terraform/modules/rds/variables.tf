variable "name_prefix" {
  description = "Prefix for RDS resources"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID for DB security group"
  type        = string
}

variable "private_subnet_ids" {
  description = "Private subnet IDs for DB subnet group"
  type        = list(string)
}

variable "db_name" {
  description = "Database name"
  type        = string
}

variable "db_username" {
  description = "Master DB username"
  type        = string
}

variable "db_password" {
  description = "Master DB password"
  type        = string
  sensitive   = true
}

variable "allocated_storage" {
  description = "Allocated storage in GB"
  type        = number
  default     = 20
}

variable "instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t4g.micro"
}

variable "engine_version" {
  description = "PostgreSQL engine version"
  type        = string
  default     = "15.8"
}

variable "app_security_group_id" {
  description = "Application security group ID allowed to connect to RDS"
  type        = string
}

variable "enable_deletion_protection" {
  description = "Enable RDS deletion protection and require final snapshot"
  type        = bool
  default     = true
}

variable "backup_retention_days" {
  description = "RDS backup retention period in days"
  type        = number
  default     = 7
}

variable "multi_az" {
  description = "Enable Multi-AZ deployment"
  type        = bool
  default     = false
}

variable "enable_performance_insights" {
  description = "Enable RDS Performance Insights"
  type        = bool
  default     = false
}

variable "apply_immediately" {
  description = "Whether RDS changes should apply immediately"
  type        = bool
  default     = false
}
