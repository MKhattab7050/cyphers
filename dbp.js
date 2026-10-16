// Share the application connection pool.
module.exports = require('./config/db').pool.promise();
