# Changelog: [mojaloop/sdk-scheme-adapter](https://github.com/mojaloop/sdk-scheme-adapter)
### [23.4.1](https://github.com/mojaloop/sdk-scheme-adapter/compare/v23.4.0...v23.4.1) (2024-03-13)


### Bug Fixes

* **mojaloop/#3750:** add timer for party lookup in cache ([#471](https://github.com/mojaloop/sdk-scheme-adapter/issues/471)) ([bfd076f](https://github.com/mojaloop/sdk-scheme-adapter/commit/bfd076f97c6b95a6d77509af2591480a6110be82)), closes [mojaloop/#3750](https://github.com/mojaloop/project/issues/3750)

## [23.4.0](https://github.com/mojaloop/sdk-scheme-adapter/compare/v23.3.1...v23.4.0) (2024-02-21)


### Features

* **mojaloop/#3750:** add log level enabled checking ([#468](https://github.com/mojaloop/sdk-scheme-adapter/issues/468)) ([345d9fc](https://github.com/mojaloop/sdk-scheme-adapter/commit/345d9fc808f457bd528fdbc1dff65b3c1a2b37ca)), closes [mojaloop/#3750](https://github.com/mojaloop/project/issues/3750)

### [23.3.1](https://github.com/mojaloop/sdk-scheme-adapter/compare/v23.3.0...v23.3.1) (2024-02-19)


### Chore

* **mojaloop/#3750:** optimize logging ([#467](https://github.com/mojaloop/sdk-scheme-adapter/issues/467)) ([abd88aa](https://github.com/mojaloop/sdk-scheme-adapter/commit/abd88aa537041771997ebb92f050ed7351865932)), closes [mojaloop/#3750](https://github.com/mojaloop/project/issues/3750)

## [23.3.0](https://github.com/mojaloop/sdk-scheme-adapter/compare/v23.1.1...v23.3.0) (2024-02-13)


### Features

* **mojaloop/#3670:** add standard components lib update for k6 validation  ([#465](https://github.com/mojaloop/sdk-scheme-adapter/issues/465)) ([9578241](https://github.com/mojaloop/sdk-scheme-adapter/commit/9578241c128f592019df29bcb4b2b8eb46fe311f)), closes [mojaloop/#3670](https://github.com/mojaloop/project/issues/3670)

### [23.1.1](https://github.com/mojaloop/sdk-scheme-adapter/compare/v23.1.0...v23.1.1) (2023-07-10)


### Bug Fixes

* protobuff vuln issue ([#455](https://github.com/mojaloop/sdk-scheme-adapter/issues/455)) ([fa600ad](https://github.com/mojaloop/sdk-scheme-adapter/commit/fa600ad0d84b5586cc1d1b2747fc6eca51ac8050)), closes [#3386](https://github.com/mojaloop/sdk-scheme-adapter/issues/3386)


### Chore

* fix to snapshot version ([#456](https://github.com/mojaloop/sdk-scheme-adapter/issues/456)) ([e5c47c9](https://github.com/mojaloop/sdk-scheme-adapter/commit/e5c47c9cb47fd618dfc2274a057108fb561432f6))
* **mojaloop/#3386:** sdk nodejs maintenance upgrade ([#453](https://github.com/mojaloop/sdk-scheme-adapter/issues/453)) ([9ac931a](https://github.com/mojaloop/sdk-scheme-adapter/commit/9ac931ae17f7f30c3ef9e25e57f0830d57349e34)), closes [mojaloop/#3386](https://github.com/mojaloop/project/issues/3386)

## [23.1.0](https://github.com/mojaloop/sdk-scheme-adapter/compare/v23.0.2...v23.1.0) (2023-07-07)


### Features

* **mojaloop/#3264:** tls cert reload issue ([#454](https://github.com/mojaloop/sdk-scheme-adapter/issues/454)) ([d5fa071](https://github.com/mojaloop/sdk-scheme-adapter/commit/d5fa071013580ae951a0c81968400b0131828322)), closes [mojaloop/#3264](https://github.com/mojaloop/project/issues/3264)

### [23.0.2](https://github.com/mojaloop/sdk-scheme-adapter/compare/v23.0.1...v23.0.2) (2023-06-15)

### [23.0.1](https://github.com/mojaloop/sdk-scheme-adapter/compare/v23.0.0...v23.0.1) (2023-06-15)


### Bug Fixes

* **mojaloop/#3382:** sdk-scheme-adapter config.trxReqEndpoint is not being set ([#451](https://github.com/mojaloop/sdk-scheme-adapter/issues/451)) ([c29a81d](https://github.com/mojaloop/sdk-scheme-adapter/commit/c29a81db5cdb673c21a96c0185eade9cb4b36e3c)), closes [mojaloop/#3382](https://github.com/mojaloop/project/issues/3382)


### Documentation

* update CHANGELOG.md [skip ci] ([#450](https://github.com/mojaloop/sdk-scheme-adapter/issues/450)) ([3b302be](https://github.com/mojaloop/sdk-scheme-adapter/commit/3b302bef13cecf16659f77ffa5aaf60eed8ee623))

## [23.0.0](https://github.com/mojaloop/sdk-scheme-adapter/compare/v22.0.2...v23.0.0) (2023-06-06)


### ⚠ BREAKING CHANGES

* **mojaloop/3344:** Changes to the RequestToPay and RequestToPayTransfer operations to ensure alignment with the FSPIOP v1.1 specifications, see [SDK Backend API](https://github.com/mojaloop/api-snippets/compare/v17.1.0...v17.2.0#diff-10028ebe8e69dc8dabdda64ce187e7e7aa953456b9f925a41bf7fdc91d0d8695), [SDK Outbound API](https://github.com/mojaloop/api-snippets/compare/v17.1.0...v17.2.0#diff-18017d197f177e339457590d33522aad3ebb5181d6ea64c17325de039904bd8c), and [Design Documentation](https://github.com/mojaloop/documentation/pull/413) for more information.

### Features

* **mojaloop/3344:** enhance SDK Scheme Adaptor to support the request to Pay use case ([#446](https://github.com/mojaloop/sdk-scheme-adapter/issues/446)) ([388f1df](https://github.com/mojaloop/sdk-scheme-adapter/commit/388f1dfb2db963a262cf26744d16b44434120536)), closes [mojaloop/#3344](https://github.com/mojaloop/project/issues/3344)

### Maintenance
* fix: updates for nx v16 changes ([#449](https://github.com/mojaloop/sdk-scheme-adapter/pull/449))

### [22.0.2](https://github.com/mojaloop/sdk-scheme-adapter/compare/v22.0.1...v22.0.2) (2023-04-27)


### Bug Fixes

* **mojaloop/3285:** request to pay scenario field format ([#442](https://github.com/mojaloop/sdk-scheme-adapter/issues/442)) ([7121e12](https://github.com/mojaloop/sdk-scheme-adapter/commit/7121e1257db9aac7f2d5fbdd1c9f49cda5c7002e))

### [22.0.1](https://github.com/mojaloop/sdk-scheme-adapter/compare/v22.0.0...v22.0.1) (2023-02-28)


### Bug Fixes

* **mojaloop/3137:** bulk transactions sdk crash ([#440](https://github.com/mojaloop/sdk-scheme-adapter/issues/440)) ([acb7a01](https://github.com/mojaloop/sdk-scheme-adapter/commit/acb7a0172a3a43d0cc20350622ae68162f4b9252))

## [22.0.0](https://github.com/mojaloop/sdk-scheme-adapter/compare/v21.6.1...v22.0.0) (2023-02-17)


### Bug Fixes

* **mojaloop/3132:** wso2 auth fix fspiop handler ([#437](https://github.com/mojaloop/sdk-scheme-adapter/issues/437)) ([4260361](https://github.com/mojaloop/sdk-scheme-adapter/commit/4260361f537606de15d114da3aa897e6124e1a34))

### [21.6.1](https://github.com/mojaloop/sdk-scheme-adapter/compare/v21.6.0...v21.6.1) (2023-02-14)


### Bug Fixes

* **mojaloop/2891:** fix outbound fspiop headers ([#436](https://github.com/mojaloop/sdk-scheme-adapter/issues/436)) ([bfce0b0](https://github.com/mojaloop/sdk-scheme-adapter/commit/bfce0b097d40d565da47b5c56a0e7a84ff47fb1d))

## [21.6.0](https://github.com/mojaloop/sdk-scheme-adapter/compare/v21.5.2...v21.6.0) (2023-01-19)


### Features

* **mojaloop/#3053:** add support for subscenarios to backend, outboud and ilp ([#430](https://github.com/mojaloop/sdk-scheme-adapter/issues/430)) ([f6c739a](https://github.com/mojaloop/sdk-scheme-adapter/commit/f6c739a93ab6e64a0bd824ed31fc45e1ec56c948)), closes [mojaloop/#3053](https://github.com/mojaloop/project/issues/3053)

### [21.5.2](https://github.com/mojaloop/sdk-scheme-adapter/compare/v21.5.1...v21.5.2) (2022-12-16)


### Chore

* **mojaloop/#3074:** sync DFSP backend api with api-snippets ([#428](https://github.com/mojaloop/sdk-scheme-adapter/issues/428)) ([edf601e](https://github.com/mojaloop/sdk-scheme-adapter/commit/edf601ea407c5d8624c3cc2d8ff96e012805a71e)), closes [mojaloop/#3074](https://github.com/mojaloop/project/issues/3074)

### [21.5.1](https://github.com/mojaloop/sdk-scheme-adapter/compare/v21.5.0...v21.5.1) (2022-12-14)


### Chore

* sort SDK backend api and upgrade dependencies ([#429](https://github.com/mojaloop/sdk-scheme-adapter/issues/429)) ([75bb92a](https://github.com/mojaloop/sdk-scheme-adapter/commit/75bb92a99512e7879003ddd5bbc11b7ba5206814))

## [21.5.0](https://github.com/mojaloop/sdk-scheme-adapter/compare/v21.4.0...v21.5.0) (2022-11-24)


### Features

* **mojaloop/3023:** align ttk func tests from ttk testcases repo ([#425](https://github.com/mojaloop/sdk-scheme-adapter/issues/425)) ([973faa7](https://github.com/mojaloop/sdk-scheme-adapter/commit/973faa7bd09e69608b324fb754c20d2a0719da85))


### Chore

* **mojaloop/#3018:** update documentation for transferId refactor [skip ci] ([#424](https://github.com/mojaloop/sdk-scheme-adapter/issues/424)) ([9680e32](https://github.com/mojaloop/sdk-scheme-adapter/commit/9680e325830f557fa778d31e1610a86901361af1)), closes [mojaloop/#3018](https://github.com/mojaloop/project/issues/3018)

## [21.4.0](https://github.com/mojaloop/sdk-scheme-adapter/compare/v21.3.5...v21.4.0) (2022-11-12)


### Features

* **mojaloop/3018:** [SDK-Scheme-Adapter] TransactionId is being used instead of TransferId ([#422](https://github.com/mojaloop/sdk-scheme-adapter/issues/422)) ([5d349fe](https://github.com/mojaloop/sdk-scheme-adapter/commit/5d349fe066f26629298e3e53dec3cd2bc6b57126))

### [21.3.5](https://github.com/mojaloop/sdk-scheme-adapter/compare/v21.3.4...v21.3.5) (2022-11-11)


### Bug Fixes

* fix logic to prune acceptParty false quote response ([#423](https://github.com/mojaloop/sdk-scheme-adapter/issues/423)) ([6360c6c](https://github.com/mojaloop/sdk-scheme-adapter/commit/6360c6c12390f9507cb4549fb7e6ab0eaadeb151))

### [21.3.4](https://github.com/mojaloop/sdk-scheme-adapter/compare/v21.3.3...v21.3.4) (2022-11-11)


### Bug Fixes

* fix quote last error missing on batch failure response ([#421](https://github.com/mojaloop/sdk-scheme-adapter/issues/421)) ([bf65415](https://github.com/mojaloop/sdk-scheme-adapter/commit/bf65415aa82e895f0181748ec0fd14ed09f56134))

### [21.3.3](https://github.com/mojaloop/sdk-scheme-adapter/compare/v21.3.2...v21.3.3) (2022-11-10)


### Bug Fixes

* **mojaloop/3017:** callbacks count comparison logic ([#419](https://github.com/mojaloop/sdk-scheme-adapter/issues/419)) ([56e1db0](https://github.com/mojaloop/sdk-scheme-adapter/commit/56e1db02a7c741dbedac05e320b4208cc06d02ea))

### [21.3.2](https://github.com/mojaloop/sdk-scheme-adapter/compare/v21.3.1...v21.3.2) (2022-11-09)


### Bug Fixes

* fix party lasterror logic ([a232def](https://github.com/mojaloop/sdk-scheme-adapter/commit/a232def8e7e972369ffd0aff9012ddc7bc4fb9e2))

### [21.3.1](https://github.com/mojaloop/sdk-scheme-adapter/compare/v21.3.0...v21.3.1) (2022-11-09)


### Bug Fixes

* fix missing party error ([#418](https://github.com/mojaloop/sdk-scheme-adapter/issues/418)) ([54d858c](https://github.com/mojaloop/sdk-scheme-adapter/commit/54d858c39ec40109e88816a8465fd24010ebd469))

## [21.3.0](https://github.com/mojaloop/sdk-scheme-adapter/compare/v21.2.0...v21.3.0) (2022-11-09)


### Features

* **mojaloop/3000:** higher capacity bulk tests for load charact... ([cd14508](https://github.com/mojaloop/sdk-scheme-adapter/commit/cd145081007d4a47888fac3e6eaaa33e1eb95634))

## [21.2.0](https://github.com/mojaloop/sdk-scheme-adapter/compare/v21.1.1...v21.2.0) (2022-11-08)


### Features

* added two payee sdks and ttk as hub in func tests ([#413](https://github.com/mojaloop/sdk-scheme-adapter/issues/413)) ([42a9d4a](https://github.com/mojaloop/sdk-scheme-adapter/commit/42a9d4a1c0625f33dda7a5f26e3ca29de00a4a28))


### Bug Fixes

* remove transactionId from required from sdk api spec ([#417](https://github.com/mojaloop/sdk-scheme-adapter/issues/417)) ([c391a21](https://github.com/mojaloop/sdk-scheme-adapter/commit/c391a217e88bf03e6a8959233fb8a46ca85dd798))

### [21.1.1](https://github.com/mojaloop/sdk-scheme-adapter/compare/v21.1.0...v21.1.1) (2022-11-07)


### Bug Fixes

* update party callback handling ([#416](https://github.com/mojaloop/sdk-scheme-adapter/issues/416)) ([e51aa79](https://github.com/mojaloop/sdk-scheme-adapter/commit/e51aa7946e295d0f37dca43f326665c392f48532))


### Chore

* dep update ([d43c618](https://github.com/mojaloop/sdk-scheme-adapter/commit/d43c61827aab23eb3930e6f47590ab24376473ed))

## [21.1.0](https://github.com/mojaloop/sdk-scheme-adapter/compare/v21.0.1...v21.1.0) (2022-11-04)


### Features

* **mojaloop/2949:** [sdk-scheme-adapter][private-shared-lib] Update private-shared-lib to use v0.2 ([#414](https://github.com/mojaloop/sdk-scheme-adapter/issues/414)) ([b313a72](https://github.com/mojaloop/sdk-scheme-adapter/commit/b313a7298a3050dd3c47314abaffb2b4eeb122c6))


### Chore

* bump deps ([#415](https://github.com/mojaloop/sdk-scheme-adapter/issues/415)) ([d4eb87d](https://github.com/mojaloop/sdk-scheme-adapter/commit/d4eb87ded2b293a1caa57dcf30dc1accb758404f))
* remove max items from put bulkTransactions ([#412](https://github.com/mojaloop/sdk-scheme-adapter/issues/412)) ([443bd92](https://github.com/mojaloop/sdk-scheme-adapter/commit/443bd92e13e3b9e7971c7f791cb090207fbf2d17))

### [21.0.1](https://github.com/mojaloop/sdk-scheme-adapter/compare/v21.0.0...v21.0.1) (2022-11-03)


### Bug Fixes

* correct internal/external bulk quote convert function ([#411](https://github.com/mojaloop/sdk-scheme-adapter/issues/411)) ([76184be](https://github.com/mojaloop/sdk-scheme-adapter/commit/76184beb57bcf781472f64566ed9133ec395f442))

## [21.0.0](https://github.com/mojaloop/sdk-scheme-adapter/compare/v20.0.0...v21.0.0) (2022-11-02)


### ⚠ BREAKING CHANGES

* **mojaloop/2998:** docker image now uses `/opt/app` instead of the root folder which will impact config mounts, and the secrets folder is no longer included in the docker image which aligns with best practices. Both these changes should NOT be a breaking change but I have marked them as such to make this change more obvious.

* fix: updated dependencies

* chore(release): 18.0.0 [skip ci]
* **mojaloop/2998:** docker image now uses `/opt/app` instead of the root folder which will impact config mounts, and the secrets folder is no longer included in the docker image which aligns with best practices. Both these changes should NOT be a breaking change but I have marked them as such to make this change more obvious.

* fix: updated dependencies

* chore(release): 18.0.0 [skip ci]
* **mojaloop/2998:** docker image now uses `/opt/app` instead of the root folder which will impact config mounts, and the secrets folder is no longer included in the docker image which aligns with best practices. Both these changes should NOT be a breaking change but I have marked them as such to make this change more obvious.

* fix: updated dependencies

* chore(release): 18.0.0 [skip ci]

### Features

* **mojaloop/2998:** change ttk apis to async ([#409](https://github.com/mojaloop/sdk-scheme-adapter/issues/409)) ([8cdc08b](https://github.com/mojaloop/sdk-scheme-adapter/commit/8cdc08b4e80a8d01b2cf86c7ef46106076397a2b)), closes [#323](https://github.com/mojaloop/sdk-scheme-adapter/issues/323) [#326](https://github.com/mojaloop/sdk-scheme-adapter/issues/326) [#337](https://github.com/mojaloop/sdk-scheme-adapter/issues/337) [#327](https://github.com/mojaloop/sdk-scheme-adapter/issues/327) [#328](https://github.com/mojaloop/sdk-scheme-adapter/issues/328) [#329](https://github.com/mojaloop/sdk-scheme-adapter/issues/329) [mojaloop/#2811](https://github.com/mojaloop/project/issues/2811)


### Chore

* fix version rc [skip ci] ([c13b4b1](https://github.com/mojaloop/sdk-scheme-adapter/commit/c13b4b13859d5085406209919a1315a13bea7ea6))
* upgraded dependencies for v21 release ([#410](https://github.com/mojaloop/sdk-scheme-adapter/issues/410)) ([a088ece](https://github.com/mojaloop/sdk-scheme-adapter/commit/a088ece31761b35851cdf36e23ec5a72b7f699cc))

## [20.0.0](https://github.com/mojaloop/sdk-scheme-adapter/compare/v19.0.1...v20.0.0) (2022-10-31)


### ⚠ BREAKING CHANGES

* **mojaloop/#2990:** docker image now uses `/opt/app` instead of the root folder which will impact config mounts, and the secrets folder is no longer included in the docker image which aligns with best practices. Both these changes should NOT be a breaking change but I have marked them as such to make this change more obvious.

* fix: updated dependencies

* chore(release): 18.0.0 [skip ci]
* **mojaloop/#2990:** docker image now uses `/opt/app` instead of the root folder which will impact config mounts, and the secrets folder is no longer included in the docker image which aligns with best practices. Both these changes should NOT be a breaking change but I have marked them as such to make this change more obvious.

* fix: updated dependencies

* chore(release): 18.0.0 [skip ci]
* **mojaloop/#2990:** docker image now uses `/opt/app` instead of the root folder which will impact config mounts, and the secrets folder is no longer included in the docker image which aligns with best practices. Both these changes should NOT be a breaking change but I have marked them as such to make this change more obvious.

* fix: updated dependencies

* chore(release): 18.0.0 [skip ci]

### Features

* **mojaloop/#2990:** add bulk transfers MVP functionality ([#407](https://github.com/mojaloop/sdk-scheme-adapter/issues/407)) ([42a6e12](https://github.com/mojaloop/sdk-scheme-adapter/commit/42a6e128a460e8ee9f0f7d8aa3f6969938ecae8c)), closes [mojaloop/#2990](https://github.com/mojaloop/project/issues/2990)

### [19.0.1](https://github.com/mojaloop/sdk-scheme-adapter/compare/v19.0.0...v19.0.1) (2022-08-24)


### Bug Fixes

* **mojaloop/2886:** fix bulk-quotes and bulk-transfers functionality ([#344](https://github.com/mojaloop/sdk-scheme-adapter/issues/344)) ([85f308b](https://github.com/mojaloop/sdk-scheme-adapter/commit/85f308be589b41f0c7281c65163d791b8052accf))

## [19.0.0](https://github.com/mojaloop/sdk-scheme-adapter/compare/v18.0.2...v19.0.0) (2022-07-28)


### ⚠ BREAKING CHANGES

* use updated outbound OpenAPI specification from api-snippets (#340)

### Features

* use updated outbound OpenAPI specification from api-snippets ([#340](https://github.com/mojaloop/sdk-scheme-adapter/issues/340)) ([92eb491](https://github.com/mojaloop/sdk-scheme-adapter/commit/92eb4918fcbebc4532ebd1434aa7c565822e15bd))

### [18.0.2](https://github.com/mojaloop/sdk-scheme-adapter/compare/v18.0.1...v18.0.2) (2022-07-27)


### Bug Fixes

* ws-connection-issue ([#339](https://github.com/mojaloop/sdk-scheme-adapter/issues/339)) ([e29e158](https://github.com/mojaloop/sdk-scheme-adapter/commit/e29e158807d1c758e18418752339b8b10d42377b))


### Chore

* updates to readme for header badges [skip ci] ([#334](https://github.com/mojaloop/sdk-scheme-adapter/issues/334)) ([415bb33](https://github.com/mojaloop/sdk-scheme-adapter/commit/415bb3380a17cfd35841095bb9b2f399e969f5c6))

### [18.0.1](https://github.com/mojaloop/sdk-scheme-adapter/compare/v18.0.0...v18.0.1) (2022-07-12)


### Chore

* added .npmignore so that the test folder is not included when publishing packages ([#332](https://github.com/mojaloop/sdk-scheme-adapter/issues/332)) ([602b3ab](https://github.com/mojaloop/sdk-scheme-adapter/commit/602b3abfe861123623768e2a1c3497063ce4b909))
* uodated deps ([#333](https://github.com/mojaloop/sdk-scheme-adapter/issues/333)) ([7f9e027](https://github.com/mojaloop/sdk-scheme-adapter/commit/7f9e0277ff760ad22ab29dc3abee20322030d7dc))

## [18.0.0](https://github.com/mojaloop/sdk-scheme-adapter/compare/v17.0.1...v18.0.0) (2022-07-11)


### ⚠ BREAKING CHANGES

* **mojaloop/#2811:** docker image now uses `/opt/app` instead of the root folder which will impact config mounts, and the secrets folder is no longer included in the docker image which aligns with best practices. Both these changes should NOT be a breaking change but I have marked them as such to make this change more obvious.

### Bug Fixes

* **mojaloop/#2811:** sdk-scheme-adapter sending incorrect transferState on a PUT transfers Callback ([#331](https://github.com/mojaloop/sdk-scheme-adapter/issues/331)) ([f7e450c](https://github.com/mojaloop/sdk-scheme-adapter/commit/f7e450cc2568f70f6c9abbb39d9c2186787c31b7)), closes [mojaloop/#2811](https://github.com/mojaloop/project/issues/2811)
* updated dependencies ([6500476](https://github.com/mojaloop/sdk-scheme-adapter/commit/650047699ce7679d21a08daa1fb3cf2956b0e514))

### [17.0.1](https://github.com/mojaloop/sdk-scheme-adapter/compare/v17.0.0...v17.0.1) (2022-07-04)


### Bug Fixes

* creating inbound server ([#329](https://github.com/mojaloop/sdk-scheme-adapter/issues/329)) ([962420f](https://github.com/mojaloop/sdk-scheme-adapter/commit/962420f6fed02722c5a9aeee6c108b6fbc9f021d))

## [17.0.0](https://github.com/mojaloop/sdk-scheme-adapter/compare/v15.0.1...v17.0.0) (2022-07-04)


### ⚠ BREAKING CHANGES

* add dummy pr to major version bump due to unsquashed title (#327)

### Features

* suppress health check logs ([#328](https://github.com/mojaloop/sdk-scheme-adapter/issues/328)) ([64fadde](https://github.com/mojaloop/sdk-scheme-adapter/commit/64faddea8307aa0c19d56466d0afe8f8208c4d66))


### Chore

* add dummy pr to major version bump due to unsquashed title ([#327](https://github.com/mojaloop/sdk-scheme-adapter/issues/327)) ([ff0f29b](https://github.com/mojaloop/sdk-scheme-adapter/commit/ff0f29b7ce560565ee21cf6ae84118e1b391b5b5))
* **release:** 16.0.0 [skip ci] ([0071c65](https://github.com/mojaloop/sdk-scheme-adapter/commit/0071c65c3665239d0a482e76498f9eec5c288043))

## [16.0.0](https://github.com/mojaloop/sdk-scheme-adapter/compare/v15.0.1...v16.0.0) (2022-07-01)


### ⚠ BREAKING CHANGES

* add dummy pr to major version bump due to unsquashed title (#327)

### Chore

* add dummy pr to major version bump due to unsquashed title ([#327](https://github.com/mojaloop/sdk-scheme-adapter/issues/327)) ([ff0f29b](https://github.com/mojaloop/sdk-scheme-adapter/commit/ff0f29b7ce560565ee21cf6ae84118e1b391b5b5))

### [15.0.1](https://github.com/mojaloop/sdk-scheme-adapter/compare/v15.0.0...v15.0.1) (2022-07-01)

## [15.0.0](https://github.com/mojaloop/sdk-scheme-adapter/compare/v14.0.0...v15.0.0) (2022-06-17)


### ⚠ BREAKING CHANGES

* added outbound bulk api (#320)

### Features

* added outbound bulk api ([#320](https://github.com/mojaloop/sdk-scheme-adapter/issues/320)) ([e2e83e9](https://github.com/mojaloop/sdk-scheme-adapter/commit/e2e83e99048a755b49123e91faa3acc03dded029))

## [14.0.0](https://github.com/mojaloop/sdk-scheme-adapter/compare/v13.0.4...v14.0.0) (2022-05-19)


### ⚠ BREAKING CHANGES

* bump nodejs version and update central services (#319)

### Features

* bump nodejs version and update central services ([#319](https://github.com/mojaloop/sdk-scheme-adapter/issues/319)) ([ee5a6da](https://github.com/mojaloop/sdk-scheme-adapter/commit/ee5a6da0650aa186114755c88889c441da6dfe8a))

### [13.0.4](https://github.com/mojaloop/sdk-scheme-adapter/compare/v13.0.3...v13.0.4) (2022-05-13)


### Bug Fixes

* reformat error information response ([#318](https://github.com/mojaloop/sdk-scheme-adapter/issues/318)) ([ed844b1](https://github.com/mojaloop/sdk-scheme-adapter/commit/ed844b1d2da6c58d3c61622c07c326bda3ca3b86))

### [13.0.3](https://github.com/mojaloop/sdk-scheme-adapter/compare/v13.0.2...v13.0.3) (2022-05-12)


### Bug Fixes

* correct party outbound response ([#317](https://github.com/mojaloop/sdk-scheme-adapter/issues/317)) ([752e8b4](https://github.com/mojaloop/sdk-scheme-adapter/commit/752e8b4d315a6e9c3b8ad4ff1b65761c41e3d721))

### [13.0.2](https://github.com/mojaloop/sdk-scheme-adapter/compare/v13.0.1...v13.0.2) (2022-05-12)


### Bug Fixes

* update outbound interface and response oa3 defs ([#316](https://github.com/mojaloop/sdk-scheme-adapter/issues/316)) ([50d23d8](https://github.com/mojaloop/sdk-scheme-adapter/commit/50d23d8562afdeeeef2203d6196473c7b0e484a5))

### [13.0.1](https://github.com/mojaloop/sdk-scheme-adapter/compare/v13.0.0...v13.0.1) (2022-05-11)


### Bug Fixes

* update package.json with main and type correct path ([#315](https://github.com/mojaloop/sdk-scheme-adapter/issues/315)) ([6d0f9b5](https://github.com/mojaloop/sdk-scheme-adapter/commit/6d0f9b541f79fa50cb6c89a3ac47cf97155f60ae))

## [13.0.0](https://github.com/mojaloop/sdk-scheme-adapter/compare/v12.3.0...v13.0.0) (2022-05-10)


### ⚠ BREAKING CHANGES

* merge in mojaloop-connector differences (#314)

### Refactors

* merge in mojaloop-connector differences ([#314](https://github.com/mojaloop/sdk-scheme-adapter/issues/314)) ([e2626f9](https://github.com/mojaloop/sdk-scheme-adapter/commit/e2626f97cd13da7dc3d6d5aaf1d8cadd82fcffcc))

## [12.3.0](https://github.com/mojaloop/sdk-scheme-adapter/compare/v12.2.3...v12.3.0) (2022-05-04)


### Features

* port over prom client metrics ([#312](https://github.com/mojaloop/sdk-scheme-adapter/issues/312)) ([8de66d5](https://github.com/mojaloop/sdk-scheme-adapter/commit/8de66d505b94cddb5e3b8e857ae491f85058d395))
* pull in live reconfiguration logic ([#313](https://github.com/mojaloop/sdk-scheme-adapter/issues/313)) ([ae5648a](https://github.com/mojaloop/sdk-scheme-adapter/commit/ae5648a500eaab80804db0298facc1e352482fb9))

### [12.2.3](https://github.com/mojaloop/sdk-scheme-adapter/compare/v12.2.2...v12.2.3) (2022-04-26)


### Refactors

* change config structure and remove unused code ([#311](https://github.com/mojaloop/sdk-scheme-adapter/issues/311)) ([c2e69e7](https://github.com/mojaloop/sdk-scheme-adapter/commit/c2e69e751daf7ad74ae213e8987946fdb84dd427))

### [12.2.2](https://github.com/mojaloop/sdk-scheme-adapter/compare/v12.2.1...v12.2.2) (2022-04-22)


### Bug Fixes

* make management url config option optional ([#310](https://github.com/mojaloop/sdk-scheme-adapter/issues/310)) ([93c4048](https://github.com/mojaloop/sdk-scheme-adapter/commit/93c4048d5a604be81ce90365ff3f9cd42b531fef))

### [12.2.1](https://github.com/mojaloop/sdk-scheme-adapter/compare/v12.2.0...v12.2.1) (2022-04-21)


### Chore

* **deps:** bump validator from 13.6.0 to 13.7.0 ([#309](https://github.com/mojaloop/sdk-scheme-adapter/issues/309)) ([3800820](https://github.com/mojaloop/sdk-scheme-adapter/commit/3800820b095fa86147189e836817c49b380b6814))

## [12.2.0](https://github.com/mojaloop/sdk-scheme-adapter/compare/v12.1.0...v12.2.0) (2022-04-21)


### Features

* port use payee FSPID as GET /parties destination header if provided ([#301](https://github.com/mojaloop/sdk-scheme-adapter/issues/301)) ([3ad0ba5](https://github.com/mojaloop/sdk-scheme-adapter/commit/3ad0ba5f745b459ff6d9484c83ac3f384faf34b2))

## [12.1.0](https://github.com/mojaloop/sdk-scheme-adapter/compare/v12.0.2...v12.1.0) (2022-04-21)


### Features

* port control client and service from ml connector ([#308](https://github.com/mojaloop/sdk-scheme-adapter/issues/308)) ([e6c963c](https://github.com/mojaloop/sdk-scheme-adapter/commit/e6c963c5e5faa17f6a39e0b70f34c3e3717ba090))


### Chore

* **deps:** bump async from 2.6.3 to 2.6.4 ([#305](https://github.com/mojaloop/sdk-scheme-adapter/issues/305)) ([a20d7fd](https://github.com/mojaloop/sdk-scheme-adapter/commit/a20d7fd0c324fcac948b30e5521fd798e387c6d3))
* **deps:** bump minimist from 1.2.5 to 1.2.6 ([#307](https://github.com/mojaloop/sdk-scheme-adapter/issues/307)) ([cf33fdc](https://github.com/mojaloop/sdk-scheme-adapter/commit/cf33fdc7691d29f07e36ea2460c2686333e5f449))
* **deps:** bump trim-off-newlines from 1.0.1 to 1.0.3 ([#306](https://github.com/mojaloop/sdk-scheme-adapter/issues/306)) ([086bee6](https://github.com/mojaloop/sdk-scheme-adapter/commit/086bee692f6c5ab12c7e3bcdd6ff8688d26ff69d))
* **deps:** bump urijs from 1.19.10 to 1.19.11 ([#304](https://github.com/mojaloop/sdk-scheme-adapter/issues/304)) ([17aebdc](https://github.com/mojaloop/sdk-scheme-adapter/commit/17aebdcae89169540a32d3ae61f7dadab24868c1))

### [12.0.2](https://github.com/mojaloop/sdk-scheme-adapter/compare/v12.0.1...v12.0.2) (2022-04-19)


### Chore

* move files out of src/ ([#300](https://github.com/mojaloop/sdk-scheme-adapter/issues/300)) ([b80f943](https://github.com/mojaloop/sdk-scheme-adapter/commit/b80f943760a2bfc09415c64fd31faf84782a523e))

### [12.0.1](https://github.com/mojaloop/sdk-scheme-adapter/compare/v12.0.0...v12.0.1) (2022-04-19)


### Bug Fixes

* remove outdated koa2-oauth-server and bump to node 16 ([#302](https://github.com/mojaloop/sdk-scheme-adapter/issues/302)) ([9c1ae18](https://github.com/mojaloop/sdk-scheme-adapter/commit/9c1ae18375f033fe59c219fa7cc970bd4d0c72f2))

## [12.0.0](https://github.com/mojaloop/sdk-scheme-adapter/compare/v11.18.12...v12.0.0) (2022-03-18)


### ⚠ BREAKING CHANGES

* update typescript interfaces using latest api-snippets (#297)

### Refactors

* update typescript interfaces using latest api-snippets ([#297](https://github.com/mojaloop/sdk-scheme-adapter/issues/297)) ([9a72083](https://github.com/mojaloop/sdk-scheme-adapter/commit/9a7208372976297a307a57478fb339b4ebbdc790))

### [11.18.12](https://github.com/mojaloop/sdk-scheme-adapter/compare/v11.18.11...v11.18.12) (2022-02-15)


### Chore

* add config option for mismatch id's ([#291](https://github.com/mojaloop/sdk-scheme-adapter/issues/291)) ([8e9717a](https://github.com/mojaloop/sdk-scheme-adapter/commit/8e9717a02c6d19f93b78f5b293917050be0ade84))

### [11.18.11](https://github.com/mojaloop/sdk-scheme-adapter/compare/v11.18.9...v11.18.11) (2021-11-25)

### [11.18.9](https://github.com/mojaloop/sdk-scheme-adapter/compare/v11.18.8...v11.18.9) (2021-10-20)

### [11.18.8](https://github.com/mojaloop/sdk-scheme-adapter/compare/v11.18.7...v11.18.8) (2021-09-16)


### Bug Fixes

* **mojaloop/#2478:** sdk-scheme-adapter does not publish ws notifications when cache is restarted ([0a301c5](https://github.com/mojaloop/sdk-scheme-adapter/commit/0a301c59f3a17adc3e32d1965353b776c568ecae)), closes [mojaloop/#2478](https://github.com/mojaloop/project/issues/2478)


### Chore

* maintenance updates ([ebe5ce5](https://github.com/mojaloop/sdk-scheme-adapter/commit/ebe5ce56c93ae564c4e1055c65ba130f11b623f2))

### [11.18.7](https://github.com/mojaloop/sdk-scheme-adapter/compare/v11.18.6...v11.18.7) (2021-08-27)


### Bug Fixes

* **mojaloop/#2436:** sdk-sch-adapter inb-API responds incorrectly for 'Unknown uri' error scenario ([132f941](https://github.com/mojaloop/sdk-scheme-adapter/commit/132f941a365bfa60b456d21b4a5d301fb3af9695)), closes [mojaloop/#2436](https://github.com/mojaloop/project/issues/2436)

### [11.18.6](https://github.com/mojaloop/sdk-scheme-adapter/compare/v11.18.5...v11.18.6) (2021-08-26)


### Bug Fixes

* **mojaloop/#2433:** sdk-scheme-adapter-v11.18.5-release-failing-on-startup ([39cc8e2](https://github.com/mojaloop/sdk-scheme-adapter/commit/39cc8e2df09676798e0e6062d13f3de903544adf)), closes [mojaloop/#2433](https://github.com/mojaloop/project/issues/2433)

### [11.18.5](https://github.com/mojaloop/sdk-scheme-adapter/compare/v11.18.4...v11.18.5) (2021-08-25)


### Chore

* regenerate openapi3 definitions ([#281](https://github.com/mojaloop/sdk-scheme-adapter/issues/281)) ([3db7a0a](https://github.com/mojaloop/sdk-scheme-adapter/commit/3db7a0a9b2a4459e0c817bfe31738104d23e6543))

### [11.18.4](https://github.com/mojaloop/sdk-scheme-adapter/compare/v11.18.3...v11.18.4) (2021-08-06)

### [11.18.2](https://github.com/mojaloop/sdk-scheme-adapter/compare/v11.18.0...v11.18.2) (2021-07-28)

## [11.18.0](https://github.com/mojaloop/sdk-scheme-adapter/compare/v11.17.1...v11.18.0) (2021-06-21)


### Features

* **#2264:** add more robust header validation for inbound server ([#278](https://github.com/mojaloop/sdk-scheme-adapter/issues/278)) ([9ea24d7](https://github.com/mojaloop/sdk-scheme-adapter/commit/9ea24d748ccd58fdfb30c77e98b021aa6a607b4f)), closes [#2264](https://github.com/mojaloop/sdk-scheme-adapter/issues/2264)

### [11.17.1](https://github.com/mojaloop/sdk-scheme-adapter/compare/v11.17.0...v11.17.1) (2021-06-11)


### Bug Fixes

* **2151:** helm-release-v12.1.0 ([c1b7f01](https://github.com/mojaloop/sdk-scheme-adapter/commit/c1b7f0192d1bb2de8cc660f3835543a518c084f3))

## [11.17.0](https://github.com/mojaloop/sdk-scheme-adapter/compare/v11.16.2...v11.17.0) (2021-06-09)


### Features

* **2151:** helm-release-v12.1.0 ([391dacc](https://github.com/mojaloop/sdk-scheme-adapter/commit/391dacc88558acb75277c197c64f0ee8aa5ada17))

### [11.16.2](https://github.com/mojaloop/sdk-scheme-adapter/compare/v11.16.1...v11.16.2) (2021-04-21)


### Bug Fixes

* correct transfers response structure as per API def ([#271](https://github.com/mojaloop/sdk-scheme-adapter/issues/271)) ([b143281](https://github.com/mojaloop/sdk-scheme-adapter/commit/b143281f6252bf5d228c94223959c6d7805a9efb))

### [11.16.1](https://github.com/mojaloop/sdk-scheme-adapter/compare/v11.16.0...v11.16.1) (2021-04-14)


### Bug Fixes

* **api-outbound:** proper response schema for post /authorization sync response ([#270](https://github.com/mojaloop/sdk-scheme-adapter/issues/270)) ([6535c1d](https://github.com/mojaloop/sdk-scheme-adapter/commit/6535c1de145ff58db48bc5be61dae9b0133786d8))

## [11.16.0](https://github.com/mojaloop/sdk-scheme-adapter/compare/v11.15.0...v11.16.0) (2021-03-26)


### Features

* add extensionList to quote request/response ([#269](https://github.com/mojaloop/sdk-scheme-adapter/issues/269)) ([9cbed66](https://github.com/mojaloop/sdk-scheme-adapter/commit/9cbed66f0db4190f2f34cd7ba3d531a8bbb95d79))

## [11.15.0](https://github.com/mojaloop/sdk-scheme-adapter/compare/v11.14.9...v11.15.0) (2021-03-18)


### Features

* add authorization definition for Outbound typescript ([#268](https://github.com/mojaloop/sdk-scheme-adapter/issues/268)) ([78402ba](https://github.com/mojaloop/sdk-scheme-adapter/commit/78402bab71f98ff6f5cd29c07313b4f8e129c808))

### [11.14.9](https://github.com/mojaloop/sdk-scheme-adapter/compare/v11.14.8...v11.14.9) (2021-03-08)


### Documentation

* add overview of automated releases in readme ([#266](https://github.com/mojaloop/sdk-scheme-adapter/issues/266)) ([e0a0eaa](https://github.com/mojaloop/sdk-scheme-adapter/commit/e0a0eaa077663f4fddeb35159d5a7aec6eb40f3e))

### [11.14.8](https://github.com/mojaloop/sdk-scheme-adapter/compare/v11.14.6...v11.14.8) (2021-03-01)


### Chore

* update deps ([#267](https://github.com/mojaloop/sdk-scheme-adapter/issues/267)) ([3ab14c8](https://github.com/mojaloop/sdk-scheme-adapter/commit/3ab14c85501592f5593700a965cda004bfc92a07))

### [11.14.6](https://github.com/mojaloop/sdk-scheme-adapter/compare/v11.14.5...v11.14.6) (2021-02-24)


### Chore

* fix hidden commit types not being included in changelog ([#265](https://github.com/mojaloop/sdk-scheme-adapter/issues/265)) ([c0e7f08](https://github.com/mojaloop/sdk-scheme-adapter/commit/c0e7f082bcd5de0440a708f12bbd4e5235081140))

### [11.14.5](https://github.com/mojaloop/sdk-scheme-adapter/compare/v11.14.4...v11.14.5) (2021-02-24)

### [11.14.4](https://github.com/mojaloop/sdk-scheme-adapter/compare/v11.14.3...v11.14.4) (2021-02-24)

### [11.14.3](https://github.com/mojaloop/sdk-scheme-adapter/compare/v11.14.1...v11.14.3) (2021-02-24)

### [11.14.2](https://github.com/mojaloop/sdk-scheme-adapter/compare/v11.14.1...v11.14.2) (2021-02-24)
