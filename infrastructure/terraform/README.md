## Terraform Skeleton (AWS Readiness)

This directory provides a foundational Terraform layout for deploying Slimbooks on AWS:

- VPC/networking
- Application Load Balancer (HTTPS-ready)
- ECS/Fargate service
- RDS PostgreSQL
- S3 bucket(s) for object storage
- Secrets Manager for app/runtime secrets

### Structure

- `main.tf` root module wiring
- `variables.tf` shared input variables
- `outputs.tf` key environment outputs
- `terraform.tfvars.example` sample values
- `modules/*` placeholder modules for each subsystem

### Notes

- This is a scaffold, not a production-complete stack yet.
- TLS certificates should be provisioned via ACM and attached to ALB listener in the ALB module implementation.
- State backend (S3 + DynamoDB lock) should be configured before collaborative usage.
