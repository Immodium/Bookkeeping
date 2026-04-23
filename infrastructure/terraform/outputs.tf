output "vpc_id" {
  description = "Provisioned VPC ID"
  value       = module.vpc.vpc_id
}

output "alb_dns_name" {
  description = "Application Load Balancer DNS name"
  value       = module.alb.alb_dns_name
}

output "ecs_cluster_name" {
  description = "ECS cluster name"
  value       = module.ecs.cluster_name
}

output "rds_endpoint" {
  description = "RDS endpoint hostname"
  value       = module.rds.endpoint
}

output "s3_bucket_name" {
  description = "S3 bucket used for object storage"
  value       = module.s3.bucket_name
}

output "secrets_manager_arn" {
  description = "Secrets Manager secret ARN"
  value       = module.secrets.secret_arn
}
