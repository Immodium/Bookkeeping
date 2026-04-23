## Terraform Deployment Stack (AWS)

This directory now defines a deployable AWS stack for Slimbooks:

- VPC with public/private subnets and optional NAT
- ALB with HTTP -> HTTPS redirect + ACM TLS listener
- ECS Fargate service
- EFS-backed persistent app data mount for runtime database/files
- S3 bucket for object storage assets
- Secrets Manager for runtime secret values
- RDS PostgreSQL (provisioned for next-phase DB cutover)

### Module layout

- `main.tf` root module composition
- `variables.tf` deploy-time inputs
- `outputs.tf` deploy outputs
- `terraform.tfvars.example` starter values
- `modules/vpc`
- `modules/alb`
- `modules/ecs`
- `modules/rds`
- `modules/s3`
- `modules/secrets`

### Usage

1. Copy `terraform.tfvars.example` to `terraform.tfvars` and set real values.
2. Run:
   - `terraform init`
   - `terraform plan`
   - `terraform apply`
3. Use `alb_dns_name` output as your app endpoint (or bind Route53 DNS to ALB).

### Important

- Configure a remote Terraform state backend (S3 + DynamoDB lock table) for team usage.
- Ensure `acm_certificate_arn` is for the same region as ALB.
- The runtime default is SQLite on EFS for compatibility, with S3 for object storage.
