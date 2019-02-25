# Turtl server

_Opening an issue? See the [Turtl project tracker](https://github.com/turtl/project-tracker/issues)_

This is the new Turtl server. It handles a number of things for Turtl clients:

- Account management (join/login/delete)
- Data storage
- Syncing
- Permissions and sharing

It implements a plugin architecture so things like analytics and payment
processing can be used without forcing a particular method/service.

## Running the server

The Turtl server requires [Node](https://nodejs.org/) >= 8 and a [Postgres](https://www.postgresql.org/)
instance (>= 9.6) with a dedicated user/db set up for it.

Once you have Node and Postgres set up, do the following:

```sh
mkdir turtl
cd turtl
git clone https://github.com/turtl/server
cd server/
npm install
cp config/config.yaml.default config/config.yaml
```

Now edit `config/config.yaml` as needed.
You'll want to main get your `db` settings correct, and `uploads`/`s3` sections
configured. Also, be sure to change `app.secure_hash_salt` _(unless you're going
to be running the integration tests against this server)_.

Now do:

```sh
# create the plugin directory from config.yaml#plugins.plugin_location
mkdir /path/to/plugin/dir    # (usually just plugins/ in turtl/server/)
./scripts/init-db.sh
node server.js
```

Great, done.

## Running the server (via docker-compose)

You only have to run the following docker-compose command:

```sh
docker-compose up
```

It will spawn a postgres database and the turtl server itself. Now you have a running turtl 
which is available under 'http://localhost:8181'. 

Be aware: after you cancel the docker-compose the data will be lost. For productive usage you may want
to store the postgres-data inside a docker volume.

### Configuration via ENV-Variables
In docker you may want to set each configuration value (for example the database) via environment
variables. You can override **each** default value via environment variable! Just create a variable named
with the prefix **TURTLE_** followed by the "yaml-path" written in UPPERCASE. For example: If you want
to change the **app.api_url** value you have to define the variable name like **TURTL_APP_API_URL**

## Integration tests

If you want to run the [integration tests](https://github.com/turtl/core-rs/tree/master/integration-tests)
against this instance of the server you need to do two things:

1. Leave the `app.secure_hash_salt` value as it appears in `config.yaml.default`
2. Run `node tools/populate-test.data.js`

