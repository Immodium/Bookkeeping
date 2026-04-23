variable "name_prefix" {
  description = "Prefix for S3 resources"
  type        = string
}

variable "force_destroy" {
  description = "Whether to allow deleting bucket with objects"
  type        = bool
  default     = false
}
