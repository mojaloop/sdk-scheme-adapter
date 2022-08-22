
IMAGE_SUFFIX ?= all
IMAGE_NAME ?= mojaloop/sdk-scheme-adapter
IMAGE_TAG ?= local

docker-build:
	docker build -t ${IMAGE_NAME}-${IMAGE_SUFFIX}:${IMAGE_TAG} .

docker-tag:
	docker tag ${SRC_IMAGE_NAME}-${IMAGE_SUFFIX}:${SRC_IMAGE_TAG} ${TRG_IMAGE_NAME}:${TRG_IMAGE_TAG}

docker-publish:
	docker:publish": "docker push ${IMAGE_NAME}-${IMAGE_SUFFIX}:${IMAGE_TAG}

npm-publish:
	yarn npm publish --tag ${IMAGE_TAG} --access public
