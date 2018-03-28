# Annoying Client

Version 0.1.0
2018 Bojan Markovic
bmarkovic.79@gmail.com

**Annoying Client** is a HTTP client designed to emulate potentially infinitely
long constant "pressure" to website. This is in contrast to tools like `ab` or
`wrk` which are designed to simulate concurrent hammering of a web server over a
limited number of requests or finite time.

Furthermore, while both `ab` and `wrk` are designed for web server becnhmarking
`annoying_client` is primarily designed to "generate requests" i.e. simulate
constant, normal traffic to a website in an unattended manner.

Although similar effect can be achieved using, say, `wrk` with LuaJIT scripting
and `cron`, I was unable to find a solution for my specific use-case of
generating constant traffic on a web server appearing to come from multiple
clients and observing results in real time..

## Configuration

The configuration should be in the `config.json` file in the same directory.

In this version it's possible to configure the following (the data given
corresponds to the defaults apart from `localAdresses` and `clientAuth` which
don't exist in the default config):

```javascript
{
const defaultConfig = {
  // HTTP listening port
  httpPort: 9900,
  // Base URL for performed requests
  baseUrl: 'http://127.0.0.1/',
  // number of paralel fetches in each interval
  paralel: 10,
  // interval between batches of requests 250 -> 4 times per second
  // so with paralel set to 10 it equals 40 req/sec
  interval: 250,
  // percentage of requests to index URI
  index_pct: 60,
  // URI for index requests
  index: '/',
  // URIs for other requests
  otherUris: [
    '/foo',
    '/bar'
  ],
  // List of addresses (must be available on local ifaces)
  // that the traffic will seem to come from
  localAdresses: [
    "127.0.0.2",
    "127.0.0.3",
    "127.0.0.4",
    "127.0.0.5"
    ],
  // Auth header for client auth against the tested server.
  clientAuth: "Basic YW5ub3lpbmc6cGxhaW50ZXh0",
  // Can also be an object in the form:
  clientAuth: {
    username: "annoying"
    password: "plaintext"
  }
  // This configuration can be updated by performing a PUT request to the
  // /config URI. The request must be authenticated with Basic Auth.
  //
  // PUT auth username
  username: 'annoying',
  // PUT auth password SHA256 HEX obtainable with Node 'crypto' as:
  // hash = crypto.createHash('sha256').update(password).digest('hex')
  password: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08'
  // the one above is 'test'
}
}
```

The actual configuration must be in proper JSON format (quoted keys, no
comments).

As noted above in the comments to the JSON config, configuration can be updated
by PUT-ing of a JSON object with keys to override any of the options above to
the `/config` URI endpoint.

If successful, the user will receive the config object stripped of password field
as a confirmation of changes.

## Stats

You can get the statistics on requests performed (and their results) by GET-ing
the `localhost:9900` (by default) URI in pretty-printed JSON. You can set up a
watch to monitor in real time e.g.

    $ watch 'curl -s localhost:9900'

## Development optins

Setting DEBUG to any "truthy" value will cause a special "tui" mode to be
engaged where the terminal is cleared every interval with updated stats.
