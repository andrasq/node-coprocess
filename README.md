Coprocess
=========
[![Build Status](https://api.travis-ci.com/andrasq/node-coprocess.svg?branch=master)](https://travis-ci.com/github/andrasq/node-coprocess?branch=master)
[![Coverage Status](https://codecov.io/github/andrasq/node-coprocess/coverage.svg?branch=master)](https://codecov.io/github/andrasq/node-coprocess?branch=master)
[![Coverage Status](https://coveralls.io/repos/github/andrasq/node-coprocess/badge.svg?branch=master)](https://coveralls.io/github/andrasq/node-coprocess?branch=master)


Inter-process RPC wrapped in OO notation.

    var Coprocess = require('coprocess').Coprocess;
    var cp = Coprocess.fork(function() {
        var WorkerProcess = require("coprocess").WorkerProcess;
        new WorkerProcess().listen({
            echo: function(x, cb) { cb(null, x) },
        });
    });

    cp.call('echo', 1234, function(err, reponse) {
        // => err == null, response == 1234
    });

Api
----------------

### cp.listen( event, handler(value) )

Listen for named events emitted by the remote.

### cp.emit( event [, value [...]] )

Emit a named event with an optional value to the registered event listener.

### cp.listen( methods )

Register handlers for the calls included in the `methods` name-value hash.

### cp.call( method [, arg [...]], callback )

Invoke the named `method` with the given argument(s).  The callback will be run once the
call completes with the returned result, if any.


Message Formats
----------------

Message

    { id, name, arg|argv }

Response

    { id, result }

Event

    { name, arg|argv }
