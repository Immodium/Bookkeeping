# Slimbooks AWS Deployment Guide

This repository now includes a deployable AWS baseline using:

- ECS Fargate (application runtime)
- Application Load Balancer (HTTPS + HTTP redirect)
- S3 (object storage for uploads/logos/receipts)
- Secrets Manager (runtime secrets like JWT keys)
- RDS PostgreSQL (provisioned, optional for current runtime)
- VPC with public/private subnets and NAT gateway
- EFS for persistent runtime data (`sqlite` path + uploads when `local`)

## Current runtime mode

The default AWS runtime mode is:

- `DB_ENGINE=sqlite`
- SQLite database file persisted on EFS (`/mnt/app-data/data/slimbooks.db`)
- `STORAGE_PROVIDER=s3` by default (can be switched to `local`)

This avoids a high-risk full SQL dialect migration while still making production AWS deployment real and repeatable.

## 1) Build and push image

1. Create an ECR repository:
   - Example: `slimbooks`
2. Build/push image:
   - `docker build -t slimbooks:aws .`
   - tag/push to your ECR URI.

Set `container_image` in Terraform vars to that ECR image URI.

## 2) Terraform variables

Copy:

- `infrastructure/terraform/terraform.tfvars.example` -> `infrastructure/terraform/terraform.tfvars`

Fill at minimum:

- `aws_region`
- `name_prefix`
- `vpc_cidr`
- `container_image`
- `container_port`
- `acm_certificate_arn`
- `db_name`, `db_username`, `db_password`
- `cors_origin`
- `client_url`
- `app_secrets` (JWT/SESSION secrets)

## 3) Deploy infrastructure

From `infrastructure/terraform`:

1. `terraform init`
2. `terraform plan -out plan.out`
3. `terraform apply plan.out`

Use outputs:

- `alb_dns_name`
- `s3_bucket_name`
- `ecs_cluster_name`
- `ecs_service_name`

## 4) Runtime behavior notes

- App listens on `container_port` (default `3002`).
- ALB routes HTTPS traffic to ECS tasks.
- ECS tasks mount EFS at `/mnt/app-data`.
- SQLite and backup paths are configured under `/mnt/app-data/data`.
- If `STORAGE_PROVIDER=s3`, uploaded assets use S3 URLs directly.
- If `STORAGE_PROVIDER=local`, uploads persist to EFS-backed path.

## 5) Required secrets and env

The ECS task expects these in `app_secrets` (Secrets Manager JSON):

- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `SESSION_SECRET`

`APP_SECRETS_BUNDLE` is parsed at startup and merged into process env.

## 6) Optional next phase (Postgres runtime cutover)

RDS is provisioned, but the application currently defaults to SQLite in AWS runtime for compatibility.

To cut over to PostgreSQL runtime:

1. Complete adapter + SQL dialect migration.
2. Set `DB_ENGINE=postgres` in ECS runtime.
3. Provide `DATABASE_URL`/PG env + migration pipeline.
4. Validate all reports/services against PostgreSQL date/time semantics.

