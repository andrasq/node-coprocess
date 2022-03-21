Coprocess
=========
[![Build Status](https://api.travis-ci.com/andrasq/node-coprocess.svg?branch=master)](https://travis-ci.com/github/andrasq/node-coprocess?branch=master)
[![Coverage Status](https://codecov.io/github/andrasq/node-coprocess/coverage.svg?branch=master)](https://codecov.io/github/andrasq/node-coprocess?branch=master)


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

### cp.emit( event [, value] )

Emit a named event with an optional value.

### cp.call( method [, arg [...]], callback )

Invoke the named `method` with the given argument(s).  The callback will be run once the
call completes with the returned result, if any.

### cp.process( methods )

Register handlers for the named methods.


Message Format
----------------

    {
      id,
      name,
      val,
      av,
      res,
      err,
    }
