resource "google_compute_instance" "mongod_shard_1_1" {
  boot_disk {
    auto_delete = true
    source      = "mongod-shard-1-1"
  }

  labels = {
    "env"  = "prod"
    "type" = "mongo-shard"
  }

  machine_type = "e2-custom-4-8192"

  metadata = {
    startup-script = "sudo ufw allow ssh"
  }

  name = "mongod-shard-1-1"

  network_interface {
    access_config {
      network_tier = "PREMIUM"
    }

    network    = "default"
    network_ip = "10.132.0.52"
  }

  project = var.project_id

  reservation_affinity {
    type = "ANY_RESERVATION"
  }

  scheduling {
    automatic_restart   = true
    on_host_maintenance = "MIGRATE"
    provisioning_model  = "STANDARD"
  }

  service_account {
    email  = "${var.project_number}-compute@developer.gserviceaccount.com"
    scopes = ["https://www.googleapis.com/auth/devstorage.read_only", "https://www.googleapis.com/auth/logging.write", "https://www.googleapis.com/auth/monitoring.write", "https://www.googleapis.com/auth/service.management.readonly", "https://www.googleapis.com/auth/servicecontrol", "https://www.googleapis.com/auth/trace.append"]
  }

  zone = var.zone["b"]
}
# terraform import google_compute_instance.mongod_shard_1_1 projects/${var.project_id}/zones/${var.zone["b"]}/instances/mongod-shard-1-1
