#!/bin/bash
set -xe

run_int_tests() {
  pushd modules/$1
  yarn run start & echo $! > /tmp/sdk-scheme-adapter.pid
  sleep 10
  yarn run test:integration || (docker compose logs && false)
  kill $(cat /tmp/sdk-scheme-adapter.pid)
  popd
}

docker load -i /tmp/docker-image.tar
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

docker compose down
docker compose -f ./docker-compose.yml -f ./docker-compose.pm4ml.yml up -d
docker compose ps

log_pid=$(docker logs -f "$(docker ps -qf "name=sdk-scheme-adapter-api-svc")" > ./test/results/sdk-api-svc.log 2>&1 & echo $!)

yarn run wait-4-docker

pushd modules/api-svc
yarn run test:integration-pm4ml || (docker compose -f ./docker-compose.yml -f ./docker-compose.pm4ml.yml logs && false)
popd
kill "$log_pid"

echo "Validating OpenAPI specs"
yarn run build:openapi && yarn run validate:api
