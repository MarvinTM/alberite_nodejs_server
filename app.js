//DATABASE INITIALIZATION
const pg = require('pg');
const connectionString = process.env.DATABASE_URL || 'postgres://localhost:5432/alberite';
const uuidV4 = require('uuid/v4');

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
function executeQuery(queryStr, params, success) {
  pool.connect(function(err, client, done) {
    var results = [];
    var query = client.query(queryStr, params);
    query.on('row', function (row) {
      results.push(row);
    });
    query.on('end', function() {
      done();
      success(results);
    });
  });
}

function writeLogInfo(logInfo, callback) {
  var queryStr = "INSERT INTO LOGINFO VALUES ('";
  queryStr += uuidV4()+"','"+logInfo.message+"','"+logInfo.messagedate+"','"+logInfo.type+"', '"+logInfo.externalip+"')";
  executeQuery(queryStr, null, function(results) {
    callback();
  });

};

//FINISHED DATABASE INITIALIZATION 

//SYSTEM ACTIONS

function deleteSystemActions(callback) {
  var queryStr = "DELETE FROM SYSTEM";
  executeQuery(queryStr, null, function(results) {
    callback();
  });
};

function initiateSystemAction(pin, duration, callback) {
  var insertStr = "INSERT INTO SYSTEM VALUES ($1, $2)";
  executeQuery(insertStr, [pin, duration], callback); 
};

var express = require('express');
var bodyParser = require('body-parser');
var app = express();
var port = 8080;
var fs = require('fs');

app.use(bodyParser.urlencoded({
    extended: true
}));
app.use(bodyParser.json());

app.get('/loginfo', function (req, res) {
  var queryStr = 'SELECT id, message, messagedate, type, externalip FROM loginfo ORDER BY messagedate DESC LIMIT 20';
  executeQuery(queryStr, null, function(results) {
    res.json(results);
  });
})

app.post('/ping', function (req, res) {
  var bodyObj = req.body;
console.log(JSON.stringify(bodyObj));
  writeLogInfo(bodyObj, function(results) {
    var querySystem = "SELECT * FROM SYSTEM";
    executeQuery(querySystem, null, function(results) {
      var response;
      if(results.length!=0) {
        response = {message: 'System active', opCode: 1, systemInfo: results};
      } else {
        response = {message: 'Everything is ok', opCode: 0};
      }
      res.json(response);     
    });
  });
});

app.post('/systemInitiating',  function (req, res) {
  var bodyObj = req.body;
  writeLogInfo(bodyObj, function(results) {
    //Delete system action from table
    deleteSystemActions(function() {
      response = {message: 'Everything is ok', opCode: 0};
      res.json(response);
    });
  });
});

app.post('/systemHasStarted',  function (req, res) {
  var bodyObj = req.body;
  writeLogInfo(bodyObj, function(results) {
    var response = {message: 'Everything is ok', opCode: 0};
    res.json(response);
  });
});


app.post('/systemHasFinished',  function (req, res) {
  var bodyObj = req.body;
  writeLogInfo(bodyObj, function(results) {
    var response = {message: 'Everything is ok', opCode: 0};
    res.json(response);
  });
});

app.get('/startSystemAction', function (req, res) {
  var pin = req.query.pin;
  var duration = req.query.duration;
  console.log('Initiating action with pin: '+pin);
  initiateSystemAction(pin, duration, function(results) {
    res.json({message: 'Everything is ok', opCode: 0});
  });
});


//PAGES ENDPOINTS

app.get('/', function(req, res) {
  fs.readFile('index.html', 'utf8', function(err, data) {
    res.send(data);
  });
});


app.listen(port, function () {
  console.log('Alberite starting!! Listening on port '+port+'!')
})
