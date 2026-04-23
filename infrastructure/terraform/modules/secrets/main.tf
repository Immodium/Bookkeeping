resource "aws_secretsmanager_secret" "app" {
  name = "${var.name_prefix}-app-secrets"
}

resource "aws_secretsmanager_secret_version" "app" {
  secret_id     = aws_secretsmanager_secret.app.id
  secret_string = jsonencode(var.app_secrets)
}
