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
function executeQuery(queryStr, params, success, errorFunc) {
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
    query.on('error', function(error) {
      console.error('Boom: '+error);
      if(errorFunc) {
        errorFunc(error);
      }
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

function moveActionToArchive(callback) {
  var queryStr = "SELECT * FROM ACTIONS ORDER BY INDEX LIMIT 1";
  executeQuery(queryStr, null, function(results) {
    var action = results[0];
    var queryDelete = "DELETE FROM ACTIONS WHERE INDEX=$1";
    executeQuery(queryDelete, [action.index], function(results) {
      console.log('Archiving action');
      var queryInsertArchive = "INSERT INTO PAST_ACTIONS SELECT COALESCE(MAX(INDEX), 0)+1, $1, $2, $3, $4, $5 FROM PAST_ACTIONS";
      console.log('Action archived');
      var now = new Date();
      now.setHours(now.getHours()+2); //adjust for GMT+2
      executeQuery(queryInsertArchive, [action.phase, action.time, now, action.index, action.programmed_action], function() {
        callback();
      });
    });
  });
};

function getMaxSystemAction(callback) {
  var queryStr = "SELECT COALESCE(MAX(index), 0)::integer as maxindex FROM ACTIONS";
  executeQuery(queryStr, null, function(results) {
    callback(results);
  });
};

function initiateSystemAction(pin, duration, callback, programmedAction) {
  getMaxSystemAction(function(maxIndex) {
    console.log(maxIndex);
    var insertStr = "INSERT INTO ACTIONS VALUES ($1, $2, $3, $4)";
    executeQuery(insertStr, [pin, duration, maxIndex[0].maxindex+1, programmedAction], callback); 
  });
};

function deleteProgrammedAction(programmedAction, callback) {
  console.log('Deleting programmed action: '+programmedAction);
  var queryStr = "DELETE FROM PROGRAMMED_ACTIONS WHERE INDEX=$1";
  executeQuery(queryStr, [programmedAction], function(results) {
    callback();
  });
};

function insertProgrammedAction(phase, time, frequency, hour, callback, errorCallback) {
  var insertStr = "INSERT INTO PROGRAMMED_ACTIONS SELECT $1, $2, coalesce(max(index), 0)+1, $3, $4 FROM PROGRAMMED_ACTIONS";
  executeQuery(insertStr, [phase, time, frequency, hour], callback, errorCallback);
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
app.use(express.static('static'))


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
    res.header('Access-Control-Allow-Origin', '*');
    res.json(results);
  });
});

app.get('/actionsInfo', ensureAuthenticated, function (req, res) {
  var querySystem = "SELECT * FROM ACTIONS ORDER BY INDEX ASC";
  executeQuery(querySystem, null, function(results) {
    res.header('Access-Control-Allow-Origin', '*');
    res.json(results); 
  });
});

app.get('/pastActionsInfo', ensureAuthenticated, function (req, res) {
  var querySystem = "SELECT * FROM PAST_ACTIONS ORDER BY INDEX DESC LIMIT 15";
  executeQuery(querySystem, null, function(results) {
    res.header('Access-Control-Allow-Origin', '*');
    res.json(results);
  });
});

app.get('/programmedActionsInfo', ensureAuthenticated, function (req, res) {
  var querySystem = "SELECT * FROM PROGRAMMED_ACTIONS ORDER BY INDEX ASC";
  executeQuery(querySystem, null, function(results) {
    res.header('Access-Control-Allow-Origin', '*');
    res.json(results);
  });
});

app.get('/cancelProgrammedAction', ensureAuthenticated, function (req, res) {
  deleteProgrammedAction(req.query.programmedAction, function() {
    var response = {message: 'Everything is ok', opCode: 0};
    res.header('Access-Control-Allow-Origin', '*');
    res.json(response); 
  });
});

app.get('/insertProgrammedAction', ensureAuthenticated, function (req, res) {
  var programmedAction = req.query;
  insertProgrammedAction(programmedAction.phase, programmedAction.time, programmedAction.frequency, programmedAction.hour, function() {
    var response = {message: 'Everything is ok', opCode: 0};
    res.header('Access-Control-Allow-Origin', '*');
    res.json(response);
  }, function(error){
    var response = {message: 'Error al crear acción programada: '+error, opCode: 1};
    res.header('Access-Control-Allow-Origin', '*');
    res.json(response);
  });
});

  
app.post('/ping', function (req, res) {
  var bodyObj = req.body;
  console.log(JSON.stringify(bodyObj));
  writeLogInfo(bodyObj, function(results) {
    var querySystem = "SELECT * FROM ACTIONS";
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
    response = {message: 'Everything is ok', opCode: 0};
    res.json(response);
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
    //Delete system action from table
    moveActionToArchive(function() {
      var response = {message: 'Everything is ok', opCode: 0};
      res.json(response);
    });
  });
});

app.get('/startSystemAction', ensureAuthenticated, function (req, res) {
  var pin = req.query.pin;
  var duration = req.query.duration;
  console.log('Initiating action with pin: '+pin);
  initiateSystemAction(pin, duration, function(results) {
    res.header('Access-Control-Allow-Origin', '*');
    res.json({message: 'Everything is ok', opCode: 0});
  });
});


//PAGES ENDPOINTS
app.get('/', function(req, res) {
  if (req.isAuthenticated()) {
    res.redirect('/react'); 
  } else {
    fs.readFile('login.html', 'utf8', function(err, data) {
      res.send(data);
    });
  }
});


app.get('/main', ensureAuthenticated, function(req, res) {
  fs.readFile('index_old.html', 'utf8', function(err, data) {
    res.send(data);
  });
});

app.get('/react', ensureAuthenticated, function(req, res) {
  fs.readFile('index.html', 'utf8', function(err, data) {
    res.send(data);
  });
});

app.get('/program', ensureAuthenticated, function(req, res) {
  fs.readFile('program.html', 'utf8', function(err, data) {
    res.send(data);
  });
});

// PROGRAMED ACTIONS INTERVAL

function isOddDay() {
  return new Date().getDay()%2===1;
}

function actionShouldBeTriggered(programmedAction) {
  if(programmedAction.frequency==='Días Pares' && isOddDay()) {
   return false;
  } else if (programmedAction.frequency==='Días Impares' && !isOddDay()) {
   return false;
  }
  var now = new Date();
  var hour = now.getHours()+2; //Adjust for GMT+2
  var minutes = now.getMinutes();
  var splittedHour = programmedAction.hour.split(':');
  console.log(splittedHour);
  console.log(hour);
  console.log(minutes);
  if(hour == splittedHour[0] && minutes == splittedHour[1]) {
    return true;
  } else {
    return false;
  }
}

function findExistingProgrammedAction(programmedAction, callback) {
  var querySystem = "SELECT * FROM ACTIONS WHERE PROGRAMMED_ACTION=$1";
  executeQuery(querySystem, [programmedAction.index], callback);
}

function processProgrammedAction(programmedActions, index, finishCallback) {
  if(index===programmedActions.length) {
    finishCallback();
    return;
  }
  var programmedAction = programmedActions[index];
  if(actionShouldBeTriggered(programmedAction)) {
    console.log(programmedAction);
    findExistingProgrammedAction(programmedAction, function(results) {
      if(results.length===0) {
        initiateSystemAction(programmedAction.phase, programmedAction.time, function() {
          console.log('Programmed action triggered an action. Phase: '+programmedAction.phase);
          processProgrammedAction(programmedActions, index+1, finishCallback);
        }, programmedAction.index);
      } else {
        console.log('Action alredy exists. Phase: '+programmedAction.phase);
        processProgrammedAction(programmedActions, index+1, finishCallback);
      }
    });
  } else {
    processProgrammedAction(programmedActions, index+1, finishCallback);
  }
}

function programmedActionsProcessor() {
  console.log('Initiating processing of programmed actions at: '+(new Date()));
  var queryProgrammedActions = "SELECT * FROM PROGRAMMED_ACTIONS ORDER BY INDEX ASC";
  executeQuery(queryProgrammedActions, null, function(programmedActions) {
    processProgrammedAction(programmedActions, 0, function() {
      console.log('Finished processing programmed actions');
    });
  });  
};

setInterval(function() {
  programmedActionsProcessor();
}, 30000);
programmedActionsProcessor();


// SERVER START
app.listen(port, function () {
  console.log('Alberite starting!! Listening on port '+port+'!')
})
