#!/bin/bash
set -xe

cd test/func
docker compose --profile bulk up -d
sleep 10
docker compose -f ./ttk-tests-docker-compose.yml up --abort-on-container-exit
# docker compose --profile bulk down
