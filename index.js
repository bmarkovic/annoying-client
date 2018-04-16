const path = require('path')
const fs = require('fs')
// const os = require('os')
const url = require('url')
const urlJoin = require('url-join')
const http = require('http')
const crypto = require('crypto')
const express = require('express')
const bodyParser = require('body-parser')
const basicAuth = require('express-basic-auth')
const get = require('got')
const _ = require('lodash')

const btoa = str => Buffer.from(str).toString('base64')

/**
 * Promisifies fs.readFile
 */
const readFile = (filepath) => new Promise((resolve, reject) => {
  fs.readFile(filepath, 'utf8', (err, data) => {
    if (err) reject(err)
    else resolve(String(data))
  })
})

// Default configuration to be overriden by conf file or with PUT /config
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
  /*
  // List of addresses (must be available on local ifaces)
  // that the traffic will seem to come from
  localAdresses: [
    "127.0.0.2",
    "127.0.0.3",
    "127.0.0.4",
    "127.0.0.5"
    ],
  // Auth header for client auth against the tested server.
  clientAuth: "Basic YW5ub3lpbmc6cGxhaW50ZXh0"
  // Can also be an object in the form:
  clientAuth: {
    username: "annoying"
    password: "plaintext"
  }
   */
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

// hash cache for all (incl. irregular passwords)
// reducing CPU cost of SHA256
global.hashStore = {}

// create auth header from user/pass (client)
function auth(username, password) {

  if (username && password) {
    let basicAuth = `Basic ${btoa(`${username}:${password}`)}`
    return { 'Authorization': basicAuth }
  } else return {}
}

// authorize user/pass (server)
function authorizer (username, password) {
  if (username != global.config.username) return false

  let hash
  if (!(password in Object.keys(global.hashStore))) {
    hash = crypto.createHash('sha256').update(password).digest('hex')
    global.hashStore[password] = hash
  } else {
    hash = global.hashStore[password]
  }

  if (
    hash &&
    hash.toUpperCase() === global.config.password.toUpperCase()
  ) return true

  return false
}

// load config filie and merge configurations
function getConfig(defaultConfig) {
  let arg = process.argv[2]

  if (arg && !arg.endsWith('json')) {
    console.error(
      'ERROR: Supplied argument is not a JSON file. ' +
      'Continuing with default config.'
    )
  }

  let name = arg || 'config.json'
  let found = false
  let files = []
  let userConfig = {}

  const paths = [ './', '../', '' ]
  paths.forEach(pathlet => {
    files.push( path.resolve(pathlet, name) )
  })

  files.forEach(file => {
    if (!found && fs.existsSync(file)) {
      userConfig = require(file)
      if ((userConfig instanceof Object) && (Object.keys(userConfig).length > 0)) {
        console.log(`ENV Using configuration from file ${file}`)
        found = true
      } else {
        userConfig = {}
      }
    }
  })

  if (!found) {
    console.error(
      `ERROR: ${name} is not a proper config file. ` +
      'Continuing with default config.'
    )
  }
  return _.merge(defaultConfig, userConfig)
}

// get base URL object
function getBaseUrl(baseUrlString) {
  let parsed = url.parse(baseUrlString)

  if (!parsed.protocol) parsed.protocol = 'http:'
  if (!parsed.path) parsed.path = '/'

  return new url.URL(parsed.format())
}

// pretty print progress in debug mode
/* eslint-disable */
function printProgress(progress) {
  process.stdout.write('\033c')
  process.stdout.cursorTo(0,0)
  process.stdout.write(progress)
}
/* eslint-enable */

global.stats = {
  success: 0,
  fail: 0
}

global.reqStats = {
  index: 0,
  other: 0,
  req_to: {},
  req_from: {},
  statuses: {}
}

function registerStatus(statusCode) {
  if (!global.reqStats.statuses.hasOwnProperty(statusCode))
    global.reqStats.statuses[statusCode] = 1
  else global.reqStats.statuses[statusCode] += 1

}

global.config = getConfig(defaultConfig)

function mainLoop (config, newConfig) {

  global.config = _.merge(config, newConfig)

  let fetchOptions = {
    headers: config.headers || null,
    timeout: config.timeout || 5000
  }

  if (config.clientAuth && config.clientAuth instanceof Object) {
    fetchOptions.headers = _.merge(
      fetchOptions.headers,
      auth( config.clientAuth.username, config.clientAuth.password )
    )
  } else if (config.clientAuth && typeof config.clientAuth == 'string') {
    fetchOptions.headers = _.merge(
      fetchOptions.headers, { 'Authorization': config.clientAuth }
    )
  }

  return () => {

    let baseUrl = getBaseUrl(config.baseUrl)

    for (let i = 0; i < config.paralel; i++) {
      let uri

      let chance = _.random(1, 100)
      if (chance < config.index_pct) {
        uri = config.index
        global.reqStats.index += 1
      } else {
        uri = _.sample(config.otherUris)
        global.reqStats.other += 1
      }

      if (config.localAddresses && config.localAddresses instanceof Array) {
        fetchOptions.localAddress = _.sample(config.localAddresses)

        if (!global.reqStats.req_from.hasOwnProperty(fetchOptions.localAdress))
          global.reqStats.req_from[fetchOptions.localAddress] = 1
        else global.reqStats.req_from[fetchOptions.localAddress] += 1
      }

      let fetchUrl = urlJoin(baseUrl.toString(), uri)
      if (!global.reqStats.req_to.hasOwnProperty(fetchUrl)) global.reqStats.req_to[fetchUrl] = 1
      else global.reqStats.req_to[fetchUrl] += 1

      get(fetchUrl, fetchOptions)
        .then(res => {
          if (!res.body) throw new Error({statusCode: res.statusCode})
          else {
            registerStatus(res.statusCode)
            global.stats.success += 1
          }
        })
        .catch(rerr => {
          if (rerr.statusCode) registerStatus(rerr.statusCode)
          global.stats.fail += 1
        })
    }

    if (process.env.DEBUG) {
      printProgress(
        JSON.stringify({req: global.reqStats, res: global.stats}, null, 2)
      )
    }

  }
}

global.interval = setInterval(
  mainLoop(global.config, {}),
  global.config.interval
)

// bootstrap HTTP server
let app = express()
let server = http.createServer(app)

app.put(
  // route
  '/config',
  // authorize middleware
  basicAuth({
    challege: true,
    realm: 'Annoying Client Auth',
    authorizer
  }),
  // parse body json middleware
  bodyParser.json(),
  // our middleware
  (req, res) => {
    if (req.body) {

      clearInterval(global.interval)
      global.interval = setInterval(
        mainLoop(global.config, req.body),
        global.config.interval
      )

      let cfgObj = _.cloneDeep(global.config)
      if (cfgObj.password) delete cfgObj.password
      if (cfgObj.clientAuth) delete cfgObj.clientAuth
      res.send(cfgObj)
    }
  })

app.use((req, res) => {
  res
    .send(
      JSON.stringify({req: global.reqStats, res: global.stats}, null, 2)
    )
})

server.listen(global.config.httpPort, () => {
  console.log(
    `LISTENING HTTP Listening as PID ${process.pid} on ${global.config.httpPort}!`
  )
})
