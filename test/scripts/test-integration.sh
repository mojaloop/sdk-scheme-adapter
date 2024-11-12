#!/bin/bash
set -xe

run_int_tests() {
  pushd modules/$1
  yarn run start & echo $! > /tmp/sdk-scheme-adapter.pid
  sleep 10
  yarn run test:integration
  kill $(cat /tmp/sdk-scheme-adapter.pid)
  popd
}

docker -v
docker compose version
docker-compose -v

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

cd docker/haproxy/tls
sh createSecrets.sh
cd $CIRCLE_WORKING_DIRECTORY

docker compose down
docker compose -f ./docker-compose.yml -f ./docker-compose.pm4ml.yml up -d
docker compose ps

yarn run wait-4-docker

pushd modules/api-svc
yarn run test:integration-pm4ml
popd

echo "Validating OpenAPI specs"
yarn run build:openapi && yarn run validate:api
