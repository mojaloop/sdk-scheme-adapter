### SDK Proxy Configuration

SDK Proxy allows using the same SDK endpoint for talking to DFSP by Mojaloop API or by DFSP specific (non-standard) REST API.

To be able to connect to custom DFSP API, the API endpoint information should be defined in Proxy configuration YAML file. Also, the environment variable `PROXY_CONFIG_PATH` should be set accordingly to specify a config file location.

Note: Currently, SDK Proxy supports only outbound requests.

Configuration file looks like this:
```yaml
version: 1.0
routes:
  - description: 'Routing by URL path as string'
    match:
      - path: /sdk-path-1
      - path: /sdk-other-path-1
    destination:
      path: /switch-path-1

  - description: 'Routing by URL path as regexp'
    match:
      - path: ~ ^\/sdk-.*2$
    destination:
      path: /switch-path-2

  - description: 'Routing by query and headers params with regexp'
    match:
      - path: /sdk-custom-api
        headers:
          - name: CustomHeader
            value: ~ *
        query:
          - key: customQueryKey
            value: Value1
          - key: ~ query.*Special
            value: ~ val.*2
    destination:
      path: /switch-path-3

```

#### Description

* `version` **(required)** - should be set to `1.0`

* `routes` **(required)** - should contain an array of Routes - endpoint mappings with corresponding rules:

##### Routes:

* `description` **(optional)** - user description of Route

* `destination` **(required)** - DFSP path that SDK Proxy should forward requests to

* `match` **(required)** - should contain one or more forwarding rules that will be applied to incoming requests.
The requests will be forwarded to `destination` if **ANY** of rules match.

##### Forwarding rules:

All forwarding rules are optional, but there should be at least one defined in `match`.

Forwarding rule value can be defined in plain string or as a regular expression.

To use a regular expression, the value should be prefixed with tide symbol (`~`) and separated with space, for example:
```
~ customVal.*

~ ^\/api\/common\/.*\/v1$
```

The forwarding rule is accepted as soon as **ALL** of the items inside a forwarding rule will match the corresponding request parameters:

* `path` - used to match URL path

* `headers` - array of `name`/`value` pairs used to match HTTP request headers:
    * `name` - HTTP header name
    * `value` - HTTP header value

* `query` - array of `key`/`value` pairs used to match HTTP query params:
    * `key` - HTTP query key
    * `value` - HTTP query value
