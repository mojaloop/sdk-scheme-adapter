echo "Running integration tests...."
if [ -f yarn.lock ]; then
  yarn install --immutable
  yarn run build
  yarn run test:integration
else
  npm ci
  npm run test:integration
fi