variable "name_prefix" {
  description = "Prefix for ECS resources"
  type        = string
}

variable "aws_region" {
  description = "AWS region for ECS logging and runtime"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID for ECS service security group"
  type        = string
}

variable "private_subnet_ids" {
  description = "Private subnet IDs for ECS tasks"
  type        = list(string)
}

variable "target_group_arn" {
  description = "ALB target group ARN for ECS service"
  type        = string
}

variable "container_image" {
  description = "Container image URI"
  type        = string
}

variable "container_port" {
  description = "Application container port"
  type        = number
  default     = 3002
}

variable "desired_count" {
  description = "Desired ECS task count"
  type        = number
  default     = 1
}

variable "s3_bucket_name" {
  description = "S3 bucket name for object storage"
  type        = string
}

variable "secrets_manager_arn" {
  description = "Secrets Manager ARN containing app secrets"
  type        = string
}

variable "task_cpu" {
  description = "Fargate task CPU units"
  type        = string
  default     = "512"
}

variable "task_memory" {
  description = "Fargate task memory (MB)"
  type        = string
  default     = "1024"
}

variable "alb_security_group_id" {
  description = "ALB security group that can reach ECS tasks"
  type        = string
}

variable "cors_origin" {
  description = "CORS origin value for backend runtime"
  type        = string
}

variable "client_url" {
  description = "Client URL value for backend runtime"
  type        = string
}

variable "log_retention_days" {
  description = "CloudWatch log group retention in days"
  type        = number
  default     = 30
}

variable "storage_provider" {
  description = "Storage backend used by Slimbooks runtime"
  type        = string
  default     = "s3"
}
