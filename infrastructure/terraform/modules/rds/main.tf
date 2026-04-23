locals {
  rds_security_group_id = aws_security_group.rds.id
}

resource "aws_security_group" "rds" {
  name        = "${var.name_prefix}-rds-sg"
  description = "Security group for PostgreSQL"
  vpc_id      = var.vpc_id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [var.app_security_group_id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_db_subnet_group" "this" {
  name       = "${var.name_prefix}-db-subnets"
  subnet_ids = var.private_subnet_ids
}

resource "aws_db_instance" "this" {
  identifier             = "${var.name_prefix}-db"
  engine                 = "postgres"
  engine_version         = var.engine_version
  instance_class         = var.instance_class
  allocated_storage      = var.allocated_storage
  db_name                = var.db_name
  username               = var.db_username
  password               = var.db_password
  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  skip_final_snapshot    = !var.enable_deletion_protection
  final_snapshot_identifier = var.enable_deletion_protection ? "${var.name_prefix}-db-final" : null
  publicly_accessible    = false
  multi_az               = var.multi_az
  storage_encrypted      = true
  deletion_protection    = var.enable_deletion_protection
  backup_retention_period = var.backup_retention_days
  performance_insights_enabled = var.enable_performance_insights
  apply_immediately      = var.apply_immediately
}
