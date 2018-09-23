// ==========================================================================
//          CLOUD FUNCTION SETUP
// ==========================================================================
const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp({
    storageBucket: "test-v1-673ee.appspot.com"
});

const moment = require('moment');
const async = require('async');
const nodemailer = require('nodemailer');

//Thumbnail requires
const gcs = require('@google-cloud/storage')();
const spawn = require('child-process-promise').spawn;
const path = require('path');
const os = require('os');
const fs = require('fs');

var db = admin.firestore();

// ==========================================================================
//          TESTER FUNCTIONS
// ==========================================================================

// Take the text parameter passed to this HTTP endpoint and insert it into the
// Realtime Database under the path /messages/:pushId/original
exports.addMessage = functions.https.onRequest((req, res) => {
    // Grab the text parameter.
    const original = req.query.text;
    // Push the new message into the Realtime Database using the Firebase Admin SDK.
    db.collection('messages').doc('test').set({original: original}).then(
      // Redirect with 303 SEE OTHER to the URL of the pushed object in the Firebase console.
      res.send('DB Write Complete')
    );
  });

exports.dbQuery = functions.https.onRequest((req, res) => {
  var userRef = db.collection('users');
  var allUsers = userRef.get()
  .then(snapshot => {
    snapshot.forEach(doc => {
      console.log(doc.id, '=>', doc.data());
    });
  })
  .catch(err => {
    console.log('Error getting documents', err);
  });
})

// ==========================================================================
//          TRACKER
// ===========================================================================

function logIP(geoArr, uid) {
    db.collection("users").doc(uid).update({"trackerData": geoArr})
        .then(a => {
            console.log("saved geoArray to DB");
        })
        .catch(err => {
            console.log("Error in function logIP" + err);
        })
}

//Retrieve User data when link used
// data contains client passed informaton, and context the auth object if present
exports.fetchCredentials = functions.https.onCall((data, context) => {
    const uid = data.uid;
    const info = data.infoIP;
    const key = data.key;
    
    return db.collection("users").doc(uid).get()
    .then(doc => {
        let data = doc.data();
        let geoArr = data.trackerData;
        let certs = data.certificates;
        geoArr.push(info);
        logIP(geoArr, uid);
        if(key === data.currentCertBucketKey) {
            return {pass: true, certs: certs}
        }
        else {
            return {pass: false}
        }
    })
    .catch(err => {
        console.log("Error in function fetchCredentials" + err);
        return {error: err};
    })
});

// ==========================================================================
//          DAILY DB QUERY & EMAIL IF CERTIFICATE EXPIRING
// ==========================================================================

//Make sure to return a 200 asap so that Cron Job does not time out
//The cloud function will continue to run until execution is complete.

// res.status(200).send("Expiry Check Complete - Refer to log file");

exports.expiryCheck = functions.https.onRequest((req, res) => {
// //Get Security Key from Query String
const key = req.query.key;
const localKey = functions.config().cron.key
// Exit if the keys don't match
if (key != localKey) {
  console.log('The key provided in the request does not match the key set in the environment. Check that', key,
      'matches the cron.key attribute in `firebase env:get`');
  res.status(403).send('Security key does not match. Make sure your "key" URL query parameter matches the ' +
      'cron.key environment variable.');
  return;
}

let errors = [];
let success = [];
const clientID = "438970100782-f7dmq5mfqnarctd7ju4vtmocm4edvsuq.apps.googleusercontent.com";
const secret = "erxJpgn594osgQpIB57_O2Am";
const refreshToken = "1/TXQ5ucvLtZnw2_2Os-XgReuO9IvF9xh6LLoG11MfMfks7KTq3HryRPjwI9Me7FKs";
const accessToken = "ya29.GlueBcl0VkEsTCObeVJE5ObGzjo5hzSK-8_xb1FiqeagmWYdZxI7HPw21VYxayOsks9wVgOggw1jRo0p8Q5NgAYHWLKZT0spkcnN9AF78cQTukXHd0MZHdkVxnhn";

// OPEN TRANSPORTER
const transporter = nodemailer.createTransport({
pool: true,
host: 'smtp.gmail.com',
secure: true,
auth: {
    type: 'OAuth2',
    user: 'paynejosephanthony@gmail.com',
    clientId: clientID,
    clientSecret: secret,
    refreshToken: refreshToken,
    accessToken: accessToken,
    expires: 1484314697598
}
});
// END - Transporter Open

function massMailer() {
  var self = this;
  //Room to do something if need be, but should be sync

  //By my understanding starts the Email sequence
  self.invokeOperation();
};

//Declearing function 'invokeOperation' which is called within the main massMailer function
massMailer.prototype.invokeOperation = function() {
  var self = this;
// The signature is async.forEach(items, task, callback). items is the collection you want to iterate over 
// and task is the function to call for each item in items. Async will immediately call task with each item 
// in items as the first argument. All tasks are run in parallel. 
// Example: task(item[0]), task(item[1]) … task(item[n]). Once all tasks complete the final callback will 
// be called
  async.each(toSend, self.sendEmail, function() {
    console.log(success);
    console.log(errors);
    //========================
    //Upon completion Email logs to Ben and Joe
    //========================
    someEmails();
  });
}

////Declearing function 'sendEmail' which is called within the secondary 'invokeOperation' function
massMailer.prototype.sendEmail = function(cert, callback) {
  //So that I can see it happen
  console.log("Sending email to " + cert.email);
  var self = this;
  self.status = false;

// The first argument is an array and the second argument is a function.
// Using the first argument (i.e. the array), you can specify what you want to run in order.
// Using the second argument (i.e. the function), you can catch any errors that happens in any of the steps.
  async.waterfall([
      //First task to execute in the array
      function(callback) {
      let mailOptions = {
          from: "paynejosephanthony@gmail.com",
          to: cert.email,
          subject: `${cert.userName} your Certificate ${cert.certName} is nearing it's expiration date`,
          generateTextFromHTML: true,
          html: `<h1>Hello world</h1><p>${cert.userName} in ${cert.months} months from today your Certificate ${cert.certName} will be expiring, start thinking about renewal now to avoid complications and remain employerable!</p><p>Thanks, your Certify Team</p>`
      };

      //TODO - Make use of info response on failure
      transporter.sendMail(mailOptions, function(error, info) {
          if(error) {
          console.log(error);
          errors.push(`Failed: ${cert.email} Certificate: ${cert.name}`);
          } else {
          self.status = true;
          success.push(cert.email);
          }
          //  two arguments: the first argument is any error that we want to pass to the next step, 
          // and the second argument is the actual result or value that we want to pass to the next step.
          callback(null,self.status,cert);
      });
      }, //End first task to execute in array
      //Being second task to execute - Three arguments (previousResult[2], function to execute)
      function(statusCode, cert, callback) {
      //Create a log file perhaps 
      console.log(`${cert.email} returned ${statusCode}`);
      callback();
      } // End second task in array
  //When everything is done return to back to caller - think this returns to the function on async.each
  ], function() { callback(); }
  );
}


moment().format();
let now = moment().hour(0).minute(0).second(0).millisecond(0);
let stamp = moment(now).format("dddd, MMMM Do YYYY");
let users = []
let toSend = []

async.series([
    //1st Task
    function(callback) {
        db.collection("users").get()
            .then(snapshot => {
                snapshot.forEach(doc => {
                    users.push(doc.data());
                });
                callback(); //Exit first task
            })
            .catch(err => { callback(err)} )
    }, // End 1st Task
    
    //2nd Task
    function(callback) {
        users.forEach(user => {
            let certificates = user.certificates;
            certificates.forEach(cert => {
                let date = moment(cert.expiryDate, "Do MMM YYYY");
                var count = date.diff(now, 'months', true);
                console.log(count);
                if (count === 3 || count === 6 || count === 12 || count === 24) { // changing the number changes the expiry calculation
                    toSend.push({
                        email: user.email, 
                        userName: user.displayName,

                        certName: cert.name,
                        issueDate: cert.issueDate,
                        issuer: cert.issuer,
                        number: cert.number,
                        months: count
                    });
                }; // End if statement
            }); // End holders.forEach
        }); // End users.forEach
        callback();
    }, //End 2nd Task

    // 3rd Task - Check if there are actually any emails to send
    function(callback) {
      if (toSend.length === 0) {
          noEmails();
      } else { callback(); }
    } //End 3rd Task

], // End Tasks Array
function(err) {
    if (err) {console.log(err); }
    else if (toSend.length > 0 ) {
        new massMailer();
    }
});

//Exit Function's
function someEmails() {
  new Promise(function(resolve, reject) {
      let mailOptions = {
          from: "paynejosephanthony@gmail.com",
          to: "payne.joe@hotmail.co.nz, bennypayne12@gmail.com",
          subject: `Expiry Email Log: ${stamp}`,
          generateTextFromHTML: true,
          html: `<h3>Success</h3><p>${success}</p><br><h3>Errors</h3><p>${errors}</p>`
      };
      transporter.sendMail(mailOptions, function(error, info) {
          if(error) {console.log(error);}
          else {
              console.log(`Email sent to ${info.accepted}`)
              resolve()}
      })
  })
  .then(a => {
      transporter.close();
      res.status(200).send("Expiry Check Complete - Refer to log file"); //Replace with response object to send status code in Cloud Functions
  });
}

function noEmails() {
  new Promise(function(resolve, reject) {
      let mailOptions = {
          from: "paynejosephanthony@gmail.com",
          to: "payne.joe@hotmail.co.nz, bennypayne12@gmail.com",
          subject: `No Emails on ${stamp}`,
          generateTextFromHTML: true,
          html: `<h1>No Certificates calculated as expiring</h1><h3>Success</h3><p>${success}</p><br><h3>Errors</h3><p>${errors}</p>`
      };
      transporter.sendMail(mailOptions, function(error, info) {
          if(error) {console.log(error);}
          else {
              console.log(`Email sent to ${info.accepted}`)
              resolve()}
      })
  })
  .then(a => {
      transporter.close();
      res.status(200).send("Expiry Check Complete - No Emails - Refer to log file"); //Replace with response object to send status code in Cloud Functions
  });
}

}) // End function expiryCheck


// ==========================================================================
//          Thumbnail generation
// ==========================================================================

// [START generateThumbnail]
/**
 * When an image is uploaded in the Storage bucket We generate a thumbnail automatically using
 * ImageMagick.
 */
// [START generateThumbnailTrigger]
exports.generateThumbnail = functions.storage.object().onFinalize((object) => {
    // [END generateThumbnailTrigger]

    // [START eventAttributes]
    const fileBucket = object.bucket; // The Storage bucket that contains the file.
    const filePath = object.name; // File path in the bucket.
    const contentType = object.contentType; // File content type.
    const metageneration = object.metageneration; // Number of times metadata has been generated. New objects have a value of 1.
    // [END eventAttributes]

    // [START stopConditions]
    // Exit if this is triggered on a file that is not an image.
    if (!contentType.startsWith('image/')) {
    console.log('This is not an image.');
    return null;
    }

    // Get the file name.
    const fileName = path.basename(filePath);
    // Exit if the image is already a thumbnail.
    if (fileName.startsWith('thumb_')) {
    
    console.log('Already a Thumbnail.');
    return null;
    }
    // [END stopConditions]

    // [START thumbnailGeneration]
    // Download file from bucket.
    const bucket = gcs.bucket(fileBucket);
    const tempFilePath = path.join(os.tmpdir(), fileName);
    const metadata = {
    contentType: contentType,
    };
    return bucket.file(filePath).download({
    destination: tempFilePath,
    }).then(() => {
    console.log('Image downloaded locally to', tempFilePath);
    // Generate a thumbnail using ImageMagick.
    return spawn('convert', [tempFilePath, '-thumbnail', '200x200>', tempFilePath]);
    }).then(() => {
    console.log('Thumbnail created at', tempFilePath);
    // We add a 'thumb_' prefix to thumbnails file name. That's where we'll upload the thumbnail.
    const thumbFileName = `thumb_${fileName}`;
    const thumbFilePath = path.join(path.dirname(filePath), thumbFileName);
    // Uploading the thumbnail.
    return bucket.upload(tempFilePath, {
        destination: thumbFilePath,
        metadata: metadata,
    });
    // Once the thumbnail has been uploaded delete the local file to free up disk space.
    }).then(() => fs.unlinkSync(tempFilePath));

    // [END thumbnailGeneration]
});
// [END generateThumbnail]
