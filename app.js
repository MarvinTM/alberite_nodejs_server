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


//EXPRESS INITIALIZATION

var express = require('express');
var bodyParser = require('body-parser');
var app = express();
var port = 8080;
var fs = require('fs');

app.use(bodyParser.urlencoded({
    extended: true
}));
app.use(bodyParser.json());


//AUTHENTICATION INITIALIZATION
var auth = require('passport-local-authenticate');


function insertUser(username, password, callback) {
  console.log('Registering username: '+username+' with password: '+password);
  auth.hash(password, function(err, hashed) {
    var queryInsertUser = "INSERT INTO USERS VALUES ($1, $2, $3)";
    console.log(err);
    executeQuery(queryInsertUser, [username, hashed.hash, hashed.salt], function(results) {
      callback();
    });
  });
};

function findUser(userObj, callback) {
  var queryUser = "SELECT * FROM USERS WHERE name=$1";
    executeQuery(queryUser, [userObj.username], function(results) {
      if(results.length!=0) {
        var hashed = {hash: results[0].password, salt: results[0].salt};
        console.log('pass: '+userObj.password);
        console.log(hashed.hash);
        console.log(hashed.salt);
        auth.verify(userObj.password, hashed, function(err, verified) {
          if(verified) {
            callback(null, userObj); 
          } else {
            callback('Wrong password', null);
          }
        });
      } else {
        callback('User not found', null);
      }
    });
};

var passport = require('passport')
  , LocalStrategy = require('passport-local').Strategy;

passport.use(new LocalStrategy(
  function(username, password, done) {
    findUser({ username: username, password: password }, function (err, user) {
      if (err) { return done(err); }
      if (!user) {
        return done(null, false, { message: 'Incorrect username.' });
      }
      if (false) { //!user.validPassword(password)) {
        return done(null, false, { message: 'Incorrect password.' });
      }
      return done(null, user);
    });
  }
));

// Authentication middleware
var session = require('express-session');

app.use(express.static('public'));
app.use(session({ secret: 'mourinho' }));
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser(function(user, done) {
  done(null, user);
});

passport.deserializeUser(function(user, done) {
  //User.findById(id, function(err, user) {
    done(null, user);
  //});
});

app.post('/login',
  passport.authenticate('local', { successRedirect: '/',
                                   failureRedirect: '/',
                                   failureFlash: true })
);

app.get('/registerUser', ensureAuthenticated, function (req, res) {
  var username = req.query.username;
  var password = req.query.password;
  insertUser(username, password, function() {
    res.json({message: 'Everything is ok', opCode: 0}); 
  });
});

app.get('/logout', ensureAuthenticated, function(req, res){
  console.log('logging out');
  req.logout();
  res.redirect('/');
});

function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    // req.user is available for use here
    return next(); }

  // denied. redirect to login
  res.redirect('/')
}


// ENDPOINTS (APPLICATION)
app.get('/loginfo', ensureAuthenticated, function (req, res) {
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

app.post('/systemInitiating', function (req, res) {
  var bodyObj = req.body;
  writeLogInfo(bodyObj, function(results) {
    //Delete system action from table
    deleteSystemActions(function() {
      response = {message: 'Everything is ok', opCode: 0};
      res.json(response);
    });
  });
});

app.post('/systemHasStarted', function (req, res) {
  var bodyObj = req.body;
  writeLogInfo(bodyObj, function(results) {
    var response = {message: 'Everything is ok', opCode: 0};
    res.json(response);
  });
});


app.post('/systemHasFinished', function (req, res) {
  var bodyObj = req.body;
  writeLogInfo(bodyObj, function(results) {
    var response = {message: 'Everything is ok', opCode: 0};
    res.json(response);
  });
});

app.get('/startSystemAction', ensureAuthenticated, function (req, res) {
  var pin = req.query.pin;
  var duration = req.query.duration;
  console.log('Initiating action with pin: '+pin);
  initiateSystemAction(pin, duration, function(results) {
    res.json({message: 'Everything is ok', opCode: 0});
  });
});


//PAGES ENDPOINTS
app.get('/', function(req, res) {
  if (req.isAuthenticated()) {
    res.redirect('/main'); 
  } else {
    fs.readFile('login.html', 'utf8', function(err, data) {
      res.send(data);
    });
  }
});


app.get('/main', ensureAuthenticated, function(req, res) {
  fs.readFile('index.html', 'utf8', function(err, data) {
    res.send(data);
  });
});


app.listen(port, function () {
  console.log('Alberite starting!! Listening on port '+port+'!')
})
