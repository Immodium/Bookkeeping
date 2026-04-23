variable "name_prefix" {
  description = "Prefix for ALB resources"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID for ALB"
  type        = string
}

variable "public_subnet_ids" {
  description = "Public subnet IDs for ALB"
  type        = list(string)
}

variable "certificate_arn" {
  description = "ACM certificate ARN for HTTPS listener"
  type        = string
}

variable "target_port" {
  description = "Backend container port"
  type        = number
  default     = 3002
}

variable "health_check_path" {
  description = "Health check path for ALB target group"
  type        = string
  default     = "/api/health"
}
