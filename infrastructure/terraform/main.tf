terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

module "vpc" {
  source = "./modules/vpc"

  name_prefix = var.name_prefix
  aws_region  = var.aws_region
  vpc_cidr    = var.vpc_cidr
  enable_nat_gateway = var.enable_nat_gateway
}

module "s3" {
  source = "./modules/s3"

  name_prefix          = var.name_prefix
  enable_public_read   = var.enable_s3_public_read
  allowed_cors_origins = length(var.s3_allowed_cors_origins) > 0 ? var.s3_allowed_cors_origins : [var.cors_origin]
}

module "secrets" {
  source = "./modules/secrets"

  name_prefix = var.name_prefix
  app_secrets = var.app_secrets
}

module "rds" {
  source = "./modules/rds"

  name_prefix         = var.name_prefix
  db_name             = var.db_name
  db_username         = var.db_username
  db_password         = var.db_password
  vpc_id              = module.vpc.vpc_id
  private_subnet_ids  = module.vpc.private_subnet_ids
  instance_class      = var.db_instance_class
  allocated_storage   = var.db_allocated_storage
  engine_version      = var.db_engine_version
  multi_az            = var.db_multi_az
  backup_retention_days = var.db_backup_retention_days
  enable_deletion_protection = var.db_enable_deletion_protection
  enable_performance_insights = var.db_enable_performance_insights
  apply_immediately   = var.db_apply_immediately

}

module "alb" {
  source = "./modules/alb"

  name_prefix       = var.name_prefix
  vpc_id            = module.vpc.vpc_id
  public_subnet_ids = module.vpc.public_subnet_ids
  certificate_arn   = var.acm_certificate_arn
  target_port       = var.container_port
}

module "ecs" {
  source = "./modules/ecs"

  name_prefix           = var.name_prefix
  aws_region            = var.aws_region
  container_image       = var.container_image
  container_port        = var.container_port
  vpc_id                = module.vpc.vpc_id
  private_subnet_ids    = module.vpc.private_subnet_ids
  target_group_arn      = module.alb.target_group_arn
  s3_bucket_name        = module.s3.bucket_name
  secrets_manager_arn   = module.secrets.secret_arn
  alb_security_group_id = module.alb.security_group_id
  cors_origin           = var.cors_origin
  client_url            = var.client_url
  task_cpu              = var.ecs_task_cpu
  task_memory           = var.ecs_task_memory
  log_retention_days    = var.ecs_log_retention_days
  storage_provider      = var.runtime_storage_provider
}
