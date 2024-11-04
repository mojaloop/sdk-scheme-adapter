#!/bin/bash
set -xe

echo "Validating OpenAPI specs"
yarn run build:openapi && yarn run validate:api

run_int_tests() {
  pushd modules/$1
  yarn run start & echo $! > /tmp/sdk-scheme-adapter.pid
  sleep 10
  yarn run test:integration
  kill $(cat /tmp/sdk-scheme-adapter.pid)
  popd
}

docker-compose up -d
yarn run wait-4-docker

# no integration tests for inbound-domain-event-handler
# echo "Running outbound-domain integration tests"
# run_int_tests outbound-domain-event-handler

echo "Running outbound-command integration tests"
run_int_tests outbound-command-event-handler

echo "Execute PM4ML Integration Tests"
pushd modules/api-sv
yarn run test:integration-pm4ml
popd
