# Turtl server

This is the new Turtl server. It handles a number of things for Turtl clients:

- Account management (join/login/delete)
- Data storage
- Syncing
- Permissions and sharing

It implements a plugin architecture so things like analytics and payment
processing can be used without forcing a particular method/service.

## Running the server

The Turtl server requires a Postgres instance (>= 9.6) with a dedicated user/db
set up for it.

Copy `config/config.yaml.default` to `config/config.yaml` and edit as needed.
You'll want to main get your `db` settings correct, and `uploads`/`s3` sections
configured. Also, be sure to change `app.secure_hash_salt` _(unless you're going
to be running the integration tests against this server)_.

Now do:

```sh
# create the plugin directory from config.yaml#plugins.plugin_location
mkdir /path/to/plugin/dir
node tools/create-db-schema.js
node server.js
```

Great, done.

## Integration tests

If you want to run the [integration tests](https://github.com/turtl/core-rs/tree/master/integration-tests)
against this instance of the server you need to do two things:

1. Leave the `app.secure_hash_salt` value as it appears in `config.yaml.default`
2. Run `node tools/populate-test.data.js`

