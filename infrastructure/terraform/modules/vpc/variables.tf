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
