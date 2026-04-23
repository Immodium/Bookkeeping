variable "name_prefix" {
  description = "Prefix for naming VPC resources"
  type        = string
}

variable "aws_region" {
  description = "AWS region used to select AZs"
  type        = string
}

variable "vpc_cidr" {
  description = "CIDR block for VPC"
  type        = string
}

variable "enable_nat_gateway" {
  description = "Whether to create a NAT gateway for private subnet egress"
  type        = bool
  default     = true
}
