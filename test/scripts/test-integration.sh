#!/bin/bash
set -xeuo pipefail

run_int_tests() {
  pushd modules/$1
  yarn run start & echo $! > /tmp/sdk-scheme-adapter.pid
  sleep 10
  yarn run test:integration || (popd && docker compose logs && false)
  kill $(cat /tmp/sdk-scheme-adapter.pid)
  popd
}

LOCAL=false
for a in "$@"; do
  [[ "$a" == "--local" ]] && LOCAL=true
done

if [ "$LOCAL" = false ]; then
  echo "Running in CI/CD, so loading docker image from /tmp/docker-image.tar..."
  docker load -i /tmp/docker-image.tar
else
  echo "Running in local mode, so building docker image..."
  docker compose build sdk-scheme-adapter-api-svc
fi

docker compose up -d
docker compose ps

yarn run wait-4-docker

# no integration tests for inbound-domain-event-handler
# echo "Running outbound-domain integration tests"
# run_int_tests outbound-domain-event-handler

echo "Running outbound-command integration tests"
run_int_tests outbound-command-event-handler

echo "Execute PM4ML Integration Tests"

pushd docker/haproxy/tls
sh createSecrets.sh
popd

docker compose down -v --timeout 30
docker compose -f ./docker-compose.yml -f ./docker-compose.pm4ml.yml up -d
docker compose ps

log_pid=$(docker logs -f "$(docker ps -qf "name=sdk-scheme-adapter-api-svc")" > ./test/results/sdk-api-svc.log 2>&1 & echo $!)

yarn run wait-4-docker

pushd modules/api-svc
yarn run test:integration-pm4ml || (popd && docker compose -f ./docker-compose.yml -f ./docker-compose.pm4ml.yml logs && false)
popd
#kill "$log_pid"
docker compose down -v --timeout 30

echo "Validating OpenAPI specs"
yarn run build:openapi && yarn run validate:api
