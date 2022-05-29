/*
 * Copyright 2022 Andras Radics
 * Licensed under the Apache License, Version 2.0
 */

'use strict';

var qibl = require('qibl');
var coprocess = require('./');
var Coprocess = coprocess.Coprocess;
var WorkerProcess = coprocess.WorkerProcess;

module.exports = {
    'dummy test': function(t) {
        t.ok(true);
        t.done();
    },
}
