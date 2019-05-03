/**************************************************************************
 *  (C) Copyright ModusBox Inc. 2019 - All rights reserved.               *
 *                                                                        *
 *  This file is made available under the terms of the license agreement  *
 *  specified in the corresponding source code repository.                *
 *                                                                        *
 *  ORIGINAL AUTHOR:                                                      *
 *       James Bush - james.bush@modusbox.com                             *
 **************************************************************************/

'use strict';


const fs = require('fs');
// TODO: consider: https://github.com/JoshuaWise/better-sqlite3
const sqlite = require('sqlite');

const consoleDir = () => msg => {
    console.dir(JSON.parse(msg), { depth: Infinity, colors: true });
};

const stdout = () => msg => {
    process.stdout.write(msg);
    process.stdout.write('\n');
};

const file = path => {
    // TODO: check this isn't in object mode. See here for more:
    // https://nodejs.org/api/stream.html#stream_writable_write_chunk_encoding_callback
    const stream = fs.createWriteStream(path, { flags: 'a' });
    // TODO: when the filesystem fills up?
    return async msg => new Promise(res => {
        if (!stream.write(msg)) {
            stream.once('drain', res);
        } else {
            res();
        }
    });
};

const sqliteTransport = async path => {
    // TODO: enable db object cache? https://github.com/mapbox/node-sqlite3/wiki/Caching
    const db = await sqlite.open(path);
    await db.run('CREATE TABLE IF NOT EXISTS log(timestamp TEXT, entry TEXT)');
    await db.run('CREATE INDEX IF NOT EXISTS log_timestamp_index ON log(timestamp)');
    // TODO: when the filesystem fills up?
    //       - set a maximum table size? Discard earlier entries when full?
    return async ($msg, timestamp) => {
        const $ts = timestamp.toISOString();
        await db.run('INSERT INTO log(timestamp, entry) VALUES ($ts, json($msg))', { $ts, $msg });
        return;
    };
};


module.exports = {
    stdout,
    sqlite: sqliteTransport,
    file,
    consoleDir,
};
