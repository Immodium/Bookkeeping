resource "aws_security_group" "ecs_tasks" {
  name        = "${var.name_prefix}-ecs-tasks-sg"
  description = "Security group for Slimbooks ECS tasks"
  vpc_id      = var.vpc_id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group_rule" "alb_to_app" {
  type                     = "ingress"
  from_port                = var.container_port
  to_port                  = var.container_port
  protocol                 = "tcp"
  security_group_id        = aws_security_group.ecs_tasks.id
  source_security_group_id = var.alb_security_group_id
}

resource "aws_ecs_cluster" "this" {
  name = "${var.name_prefix}-cluster"
}

resource "aws_efs_file_system" "app_data" {
  creation_token = "${var.name_prefix}-app-data"
  encrypted      = true

  lifecycle_policy {
    transition_to_ia = "AFTER_30_DAYS"
  }
}

resource "aws_efs_access_point" "app_data" {
  file_system_id = aws_efs_file_system.app_data.id

  root_directory {
    path = "/slimbooks"
    creation_info {
      owner_gid   = 1001
      owner_uid   = 1001
      permissions = "0755"
    }
  }

  posix_user {
    gid = 1001
    uid = 1001
  }
}

resource "aws_security_group" "efs" {
  name        = "${var.name_prefix}-efs-sg"
  description = "Security group for Slimbooks EFS"
  vpc_id      = var.vpc_id
}

resource "aws_security_group_rule" "ecs_to_efs" {
  type                     = "egress"
  from_port                = 2049
  to_port                  = 2049
  protocol                 = "tcp"
  security_group_id        = aws_security_group.ecs_tasks.id
  source_security_group_id = aws_security_group.efs.id
}

resource "aws_security_group_rule" "efs_from_ecs" {
  type                     = "ingress"
  from_port                = 2049
  to_port                  = 2049
  protocol                 = "tcp"
  security_group_id        = aws_security_group.efs.id
  source_security_group_id = aws_security_group.ecs_tasks.id
}

resource "aws_efs_mount_target" "app_data" {
  count = length(var.private_subnet_ids)

  file_system_id  = aws_efs_file_system.app_data.id
  subnet_id       = var.private_subnet_ids[count.index]
  security_groups = [aws_security_group.efs.id]
}

resource "aws_iam_role" "task_execution" {
  name = "${var.name_prefix}-ecs-task-execution-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Service = "ecs-tasks.amazonaws.com"
      }
      Action = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "task_execution_managed" {
  role       = aws_iam_role.task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_cloudwatch_log_group" "ecs" {
  name              = "/ecs/${var.name_prefix}"
  retention_in_days = var.log_retention_days
}

resource "aws_ecs_task_definition" "app" {
  family                   = "${var.name_prefix}-task"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.task_cpu
  memory                   = var.task_memory
  execution_role_arn       = aws_iam_role.task_execution.arn
  task_role_arn            = aws_iam_role.task_execution.arn

  container_definitions = jsonencode([
    {
      name  = "slimbooks"
      image = var.container_image

      essential = true

      portMappings = [
        {
          containerPort = var.container_port
          hostPort      = var.container_port
          protocol      = "tcp"
        }
      ]

      environment = [
        { name = "NODE_ENV", value = "production" },
        { name = "PORT", value = tostring(var.container_port) },
        { name = "DB_ENGINE", value = "sqlite" },
        { name = "DB_PATH", value = "/mnt/app-data/data/slimbooks.db" },
        { name = "DB_BACKUP_PATH", value = "/mnt/app-data/data/backups" },
        { name = "UPLOAD_PATH", value = "/mnt/app-data/uploads" },
        { name = "STORAGE_PROVIDER", value = var.storage_provider },
        { name = "S3_BUCKET_NAME", value = var.s3_bucket_name },
        { name = "S3_REGION", value = var.aws_region },
        { name = "CORS_ORIGIN", value = var.cors_origin },
        { name = "CLIENT_URL", value = var.client_url },
        { name = "ENABLE_SAMPLE_DATA", value = "false" },
        { name = "ENABLE_DEBUG_ENDPOINTS", value = "false" },
        { name = "S3_FORCE_PATH_STYLE", value = "false" },
        { name = "STORAGE_PUBLIC_BASE_URL", value = "https://${var.s3_bucket_name}.s3.${var.aws_region}.amazonaws.com" }
      ]

      secrets = [
        {
          name      = "JWT_SECRET"
          valueFrom = "${var.secrets_manager_arn}:JWT_SECRET::"
        },
        {
          name      = "JWT_REFRESH_SECRET"
          valueFrom = "${var.secrets_manager_arn}:JWT_REFRESH_SECRET::"
        },
        {
          name      = "SESSION_SECRET"
          valueFrom = "${var.secrets_manager_arn}:SESSION_SECRET::"
        }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-region        = var.aws_region
          awslogs-group         = aws_cloudwatch_log_group.ecs.name
          awslogs-stream-prefix = "app"
        }
      },
      mountPoints = [
        {
          sourceVolume  = "app_data"
          containerPath = "/mnt/app-data"
          readOnly      = false
        }
      ]
    }
  ])

  volume {
    name = "app_data"

    efs_volume_configuration {
      file_system_id          = aws_efs_file_system.app_data.id
      transit_encryption      = "ENABLED"
      authorization_config {
        access_point_id = aws_efs_access_point.app_data.id
        iam             = "DISABLED"
      }
    }
  }
}

resource "aws_ecs_service" "app" {
  name            = "${var.name_prefix}-service"
  cluster         = aws_ecs_cluster.this.id
  task_definition = aws_ecs_task_definition.app.arn
  launch_type     = "FARGATE"
  desired_count   = var.desired_count

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [aws_security_group.ecs_tasks.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = var.target_group_arn
    container_name   = "slimbooks"
    container_port   = var.container_port
  }

  depends_on = [
    aws_iam_role_policy_attachment.task_execution_managed,
    aws_iam_role_policy.task_runtime,
    aws_cloudwatch_log_group.ecs,
    aws_efs_mount_target.app_data
  ]
}
