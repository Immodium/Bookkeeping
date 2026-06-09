#!/bin/bash
# Removes ALL Docker containers, images, volumes, and networks from this machine.
# THIS IS DESTRUCTIVE AND IRREVERSIBLE. Run only on a dev/build machine.

set -e

echo "WARNING: This will permanently delete ALL Docker containers, images, volumes, and networks."
read -rp "Type YES to continue: " confirm
if [ "$confirm" != "YES" ]; then
  echo "Aborted."
  exit 1
fi

echo "Stopping all running containers..."
docker ps -q | xargs -r docker stop

echo "Removing all containers..."
docker ps -aq | xargs -r docker rm -f

echo "Removing all images..."
docker images -q | xargs -r docker rmi -f

echo "Removing all volumes..."
docker volume ls -q | xargs -r docker volume rm

echo "Removing all custom networks..."
docker network ls --filter type=custom -q | xargs -r docker network rm

echo "Running system prune to clear cache and build artifacts..."
docker system prune -af --volumes

echo "Done. Docker is clean."
