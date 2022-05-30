Coprocess
=========
[![Build Status](https://api.travis-ci.com/andrasq/node-coprocess.svg?branch=master)](https://travis-ci.com/github/andrasq/node-coprocess?branch=master)
[![Coverage Status](https://codecov.io/github/andrasq/node-coprocess/coverage.svg?branch=master)](https://codecov.io/github/andrasq/node-coprocess?branch=master)
[![Coverage Status](https://coveralls.io/repos/github/andrasq/node-coprocess/badge.svg?branch=master)](https://coveralls.io/github/andrasq/node-coprocess?branch=master)


Inter-process RPC wrapped in OO syntax.

    var Coprocess = require('coprocess').Coprocess;

    // create a worker process
    var coproc = Coprocess.fork(function() {
        // worker must load its depencies as when in a separate file
        var WorkerProcess = require("coprocess").WorkerProcess;
        new WorkerProcess().listen({
            echo: function(x, cb) { cb(null, x) },
        });
    });

    // call the worker, wait for its response
    coproc.call('echo', 1234, function(err, reponse) {
        // => err: null, response: 1234
    });

Api
----------------

### Coprocess.fork( scriptName | functionBody )

Create a worker process running the named `scriptName` or the function `functionBody`.
Script file names are relative to the current working directory, not the source file.

Functions are converted to source and saved to temporary files in the current directory
`./node-coprocess-XXXXXX.js` and get removed automatically when the parent process calls its
`process.on('exit')` listeners.  Worker functions are a convenience, they share no context
with the parent function.  They must load and initialize all their dependencies as if they
were in their own file.

    var Coproces = requir('coprocess');

    var coproc = Coprocess.fork("./scripts/test.js");

### coproc.call( method [, arg [...]], callback(err, result) )

Invoke the named `method` with the given argument(s), and wait for the results.
The callback will be invoked with the returned result once the call completes.

### coproc.emit( event [, value [...]] )

Emit a named event and optional value(s) to the registered event listener.  Events are sent
back-to-back in order, no response is returned or expected.  Note that events and calls are
sent and dispatched in order, so receipt of a batch of events can be confirmed with a single
call after the batch.

### coproc.listen( event, handler(value [, ...]) )

Listen for named events emitted by the remote.  The handler function is called
with the received arguments whenever the named `event` is received.

    coproc.listen('stats', function(stats) {
        // received another batch of stats, no response expected
    })

### coproc.listen( methods )

Register handlers for the calls in the `methods` name-value hash.  Each handler function is
provided a callback as its last argument, and must call it to signal completion and return
an error or a result back to the caller.  If completion signaling is not needed, it is
faster to `emit` events.

    coproc.listen({
        ping: function(cb) { cb(null) },
        echo: function(value, cb) { cb(null, value) },
    })


Message Formats
----------------

Call

    { id, name, arg, argv }

Response

    { id, result }

Event

    { name, arg, argv }
