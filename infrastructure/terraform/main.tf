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
}

module "s3" {
  source = "./modules/s3"

  name_prefix = var.name_prefix
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
  allowed_cidr_blocks = [var.vpc_cidr]
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
  rds_endpoint          = module.rds.endpoint
  s3_bucket_name        = module.s3.bucket_name
  secrets_manager_arn   = module.secrets.secret_arn
  allowed_ingress_cidrs = [var.vpc_cidr]
}
