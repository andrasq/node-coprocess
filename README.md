Coproq
=========
[![Build Status](https://api.travis-ci.com/andrasq/node-coprocess.svg?branch=master)](https://travis-ci.com/github/andrasq/node-coprocess?branch=master)
[![Coverage Status](https://codecov.io/github/andrasq/node-coprocess/coverage.svg?branch=master)](https://codecov.io/github/andrasq/node-coprocess?branch=master)
[![Coverage Status](https://coveralls.io/repos/github/andrasq/node-coprocess/badge.svg?branch=master)](https://coveralls.io/github/andrasq/node-coprocess?branch=master)


Inter-process RPC wrapped in OO syntax.

    var coprocess = require('coproq');

    // create a worker process
    var coproc = coprocess.fork(function() {
        // worker must load its depencies as if in a separate file
        var Coprocess = require("coproq").Coprocess;
        new Coprocess().listen({
            echo: function(x, cb) { cb(null, x) },
        });
    });

    // call the worker, wait for its response
    coproc.call('echo', 1234, function(err, reponse) {
        // => err: null, response: 1234
    });

Api
----------------

### coprocess.fork( scriptName | functionBody [,cb] )

Create a new parent / worker object pair.  Returns the parent object used to talk to the
worker.  The worker process launched running the named `scriptName` or the function
`functionBody`.  The callback `cb` is invoked as soon as the process is running, not
after it's initialized.  The worker process is killed when the parent process exits.

Script file names are relative to the current working directory, not the source file.

Functions are converted to source and saved to temporary files in the current working directory
`./node-coprocess-XXXXXX.js` and get removed automatically when the parent process calls its
`process.on('exit')` listeners.  Worker functions are a convenience, they share no context
with the parent function.  They must load and initialize all their dependencies as if they
were in their own file.

`fork` throws if unable to create the worker.  The optional callback is invoked once the
worker process is running.

    var coproces = require('coproq');
    var coproc = coprocess.fork("./scripts/test.js");

### coproc.close( [cb(err)] )

Terminate the worker process, either by disconnecting from it or killing it.

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

    { id, name, argc, argv }

Response

    { id, result }

Event

    { name, argc, argv }


Change Log
----------------

- 0.1.3 - fix README to use `coproq` npm package name
- 0.1.2 - first published version
