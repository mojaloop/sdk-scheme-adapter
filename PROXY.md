### SDK Proxy Configuration

The SDK Proxy allows a DFSP to use the same outbound SDK endpoint for talking to a DFSP through the Mojaloop API and to a non-Mojaloop (custom) REST API exposed by the Mojaloop Hub. For example:
* to issue a Mojaloop transfer request, a DFSP would call: `http://local.sdk-adapter.com:4001/transfers`
* to issue a request to a custom API, a DFSP would call: `http://local.sdk-adapter.com:4001/customservice`

To be able to connect to a custom API, the DFSP must:

1. Define API endpoint information in a Proxy configuration YAML file.
2. Specify the location of the configuration file in the environment variable `PROXY_CONFIG_PATH`.
3. Map the configuration file into the container at runtime.

The configuration file is structured as follows:
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

#### Elements of configuration file

* `version` **(required)** - Must be set to `1.0`.

* `routes` **(required)** - Must contain an array of routes, that is, endpoint mappings with corresponding forwarding rules.

##### Routes

* `description` **(optional)** - User description of route.

* `match` **(required)** - Must contain one or more forwarding rules that will be applied to incoming requests.
A request will be forwarded to the `destination` if **ANY** of the rules match the request.

* `destination` **(required)** - The endpoint that the SDK Proxy should forward requests to.

##### Forwarding rules

There must be at least one forwarding rule defined in `match`, additional rules are optional.

A forwarding rule value can be defined as a plain string or a regular expression.

When using a regular expression, the value must be prefixed with the tilde symbol (`~`) and a space, for example:
```
~ customVal.*

~ ^\/api\/common\/.*\/v1$
```

A forwarding rule is applied by the SDK Proxy when **ALL** of the items inside the rule match the corresponding request parameters (such as an endpoint URL, or HTTP request headers, or query parameters). You can define rules about request parameters using the following elements in the configuration file:

* `path` - used to match a URL path

* `headers` - array of `name`/`value` pairs used to match HTTP request headers:
    * `name` - HTTP header name
    * `value` - HTTP header value

* `query` - array of `key`/`value` pairs used to match HTTP query parameters:
    * `key` - HTTP query key
    * `value` - HTTP query value
