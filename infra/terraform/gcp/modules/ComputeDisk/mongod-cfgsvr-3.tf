resource "google_compute_disk" "mongod_cfgsvr_3" {
  image                     = var.os["ubuntu-focal"]
  name                      = "mongod-cfgsvr-3"
  physical_block_size_bytes = 4096
  project                   = var.project_id
  size                      = var.disk_size["small"]
  type                      = "pd-balanced"
  zone                      = var.zone["b"]
  description               = "Disk for a production mongodb sharded cluster config server"
}
# terraform import google_compute_disk.mongod_cfgsvr_3 projects/${var.project_id}/zones/${var.zone["b"]}/disks/mongod-cfgsvr-3
