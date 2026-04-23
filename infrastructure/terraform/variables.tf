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

variable "desired_count" {
  description = "Desired ECS task count"
  type        = number
  default     = 1
}

variable "cors_origin" {
  description = "CORS origin exposed to backend runtime"
  type        = string
}

variable "client_url" {
  description = "Frontend URL used by backend-generated links"
  type        = string
}

variable "enable_nat_gateway" {
  description = "Whether VPC module should create NAT gateway"
  type        = bool
  default     = true
}

variable "enable_s3_public_read" {
  description = "Allow public read for uploaded assets bucket objects"
  type        = bool
  default     = true
}

variable "s3_allowed_cors_origins" {
  description = "Allowed CORS origins for S3 object GET requests"
  type        = list(string)
  default     = []
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

variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t4g.micro"
}

variable "db_allocated_storage" {
  description = "RDS allocated storage in GB"
  type        = number
  default     = 20
}

variable "db_engine_version" {
  description = "PostgreSQL engine version for RDS"
  type        = string
  default     = "15.8"
}

variable "db_multi_az" {
  description = "Enable RDS Multi-AZ deployment"
  type        = bool
  default     = false
}

variable "db_backup_retention_days" {
  description = "RDS backup retention in days"
  type        = number
  default     = 7
}

variable "db_enable_deletion_protection" {
  description = "Enable RDS deletion protection"
  type        = bool
  default     = true
}

variable "db_enable_performance_insights" {
  description = "Enable RDS Performance Insights"
  type        = bool
  default     = false
}

variable "db_apply_immediately" {
  description = "Apply RDS changes immediately"
  type        = bool
  default     = false
}

variable "app_secrets" {
  description = "Map of secret keys/values for app runtime"
  type        = map(string)
  default     = {}
  sensitive   = true
}

variable "ecs_task_cpu" {
  description = "Fargate task CPU units"
  type        = string
  default     = "512"
}

variable "ecs_task_memory" {
  description = "Fargate task memory in MiB"
  type        = string
  default     = "1024"
}

variable "ecs_log_retention_days" {
  description = "CloudWatch log retention for ECS logs"
  type        = number
  default     = 30
}

variable "runtime_storage_provider" {
  description = "Runtime storage provider for app uploads (local or s3)"
  type        = string
  default     = "s3"
}
