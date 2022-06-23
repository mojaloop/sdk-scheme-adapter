#!/usr/bin/env sh

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

set -u
set -e

HOSTS_FILE=/etc/hosts
touch ${HOSTS_FILE}

if [ `cat ${HOSTS_FILE} | grep 'scheme-adapter' | wc -l`  -gt 0 ]; then
  echo "[WARN] Already found scheme-adapter hosts in ${HOSTS_FILE}"
  echo "[WARN] exiting with status: 0"
  exit 0
fi

echo "
# Added by mojaloop
# to allow local access to mojaloop docker-compose environment
127.0.0.1       host.docker.internal
127.0.0.1       scheme-adapter, scheme-adapter-int, ml-testing-toolkit, mongo, redis
# end of section
" >> ${HOSTS_FILE}

cat ${HOSTS_FILE}
