
MAKE_IMAGE_SUFFIX ?= all
MAKE_IMAGE_NAME ?= mojaloop/sdk-scheme-adapter
MAKE_IMAGE_TAG ?= local

docker-build-default:
	docker build -t ${MAKE_IMAGE_NAME}:${MAKE_IMAGE_TAG} .

docker-build:
	docker build -t ${MAKE_IMAGE_NAME}-${MAKE_IMAGE_SUFFIX}:${MAKE_IMAGE_TAG} .

docker-tag:
	docker tag ${MAKE_SRC_IMAGE_NAME}-${MAKE_SRC_IMAGE_SUFFIX}:${MAKE_SRC_IMAGE_TAG} ${MAKE_TRG_IMAGE_NAME}:${MAKE_TRG_IMAGE_TAG}

docker-publish:
	docker:publish": "docker push ${MAKE_IMAGE_NAME}-${MAKE_IMAGE_SUFFIX}:${MAKE_IMAGE_TAG}

npm-publish:
	yarn npm publish --tag ${MAKE_IMAGE_TAG} --access public
