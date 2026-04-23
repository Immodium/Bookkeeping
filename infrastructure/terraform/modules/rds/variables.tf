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

variable "allowed_cidr_blocks" {
  description = "CIDR blocks allowed to reach PostgreSQL"
  type        = list(string)
  default     = ["10.0.0.0/8"]
}
