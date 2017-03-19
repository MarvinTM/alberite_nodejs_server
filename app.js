//DATABASE INITIALIZATION
const pg = require('pg');
const connectionString = process.env.DATABASE_URL || 'postgres://localhost:5432/alberite';

var config = {
  user: 'alberite', //env var: PGUSER 
  database: 'alberite', //env var: PGDATABASE 
  password: 'alberite', //env var: PGPASSWORD 
  host: 'localhost', // Server hosting the postgres database 
  port: 5432, //env var: PGPORT 
  max: 10, // max number of clients in the pool 
  idleTimeoutMillis: 30000, // how long a client is allowed to remain idle before being closed 
};

var pool = new pg.Pool(config);
function executeQuery(queryStr, success) {
  pool.connect(function(err, client, done) {
    var results = [];
    var query = client.query(queryStr);
    query.on('row', function (row) {
      results.push(row);
    });
    query.on('end', function() {
      done();
      success(results);
    });
  });
}
//FINISHED DATABASE INITIALIZATION 



var express = require('express');
var bodyParser = require('body-parser');
var app = express();
var port = 8080;

app.use(bodyParser.urlencoded({
    extended: true
}));
app.use(bodyParser.json());

app.get('/loginfo', function (req, res) {
  var queryStr = 'SELECT id, message, messagedate, type FROM loginfo ORDER BY messagedate';
  executeQuery(queryStr, function(results) {
    res.json(results);
  });
})

app.post('/addlog', function (req, res) {
  console.log(req.body);
  var response = {message: 'Everything is ok'};
  res.json(response);
});

app.listen(port, function () {
  console.log('Example app listening on port '+port+'!')
})
