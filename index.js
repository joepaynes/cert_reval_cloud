// ==========================================================================
//          CLOUD FUNCTION SETUP
// ==========================================================================
const { clientID, secret, refreshToken, accessToken } = require('./keys');
const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp({
    storageBucket: "test-v1-673ee.appspot.com"
});

const moment = require('moment');
const asyncModule = require('async');
const nodemailer = require('nodemailer');

var db = admin.firestore();

// ==========================================================================
//          TRACKER
// ===========================================================================

exports.fetchCredentials = functions.https.onCall(data => {

    //Declare variables - key passed in data from certBucket.jsx
    const { key } = data;

    // 1) Check if the link exists and grab link data
    return db.collection("links").doc(key).get()
    .then(doc => {
        // Link exists
        if(doc.exists) {
            let linkData = doc.data();
            let uid = linkData.uid

            // 2) Grab and return userData
            return db.collection("users").doc(uid).get()
            .then(doc => {
                let userData = doc.data();
                let profile = {
                    photoUrl: userData.photoUrl,
                    FNAME: userData.FNAME,
                    LNAME: userData.LNAME,
                    homeport: userData.homeport,
                    bio: userData.bio,
                    phone: userData.phone,
                    email: userData.email
                }

                return {
                    pass: true,
                    uid: uid,
                    certificates: userData.certificates,
                    profile: profile,
                    seatime: userData.seatime
                }
            })
            .catch(error => {
                return {error}
            })
        } else {
            return {
                pass: false
            }
        }
    })
    .catch(error => {
        return {error}
    })
});

// END fetchCredentials function

exports.logTrackerData = functions.https.onCall(data => {

    //Declare variables
    const ipInfo = data.parsedInfo;
    const uid = data.uid;
    const key = data.key

    //Manipulate data (Add timestamp)
    const now = moment().toString();
    ipInfo.timeStamp = now;

    //Post data to User DB & Notify User
    let logData = async function () {
        try {
            let userDoc = await db.collection("users").doc(uid).get()
            let linkDoc = await db.collection("links").doc(key).get()

            let userData = await userDoc.data();
            let linkData = await linkDoc.data();

            let notifications = userData.notifications;
            let trackerData = userData.trackerData;
            let name = false

            
            if(linkData.name) {
                name = linkData.name
                ipInfo.name = name
            }

            //Check if same IP has accessed within the last minute
            let check = false
            let minusFive = moment(ipInfo.timeStamp).subtract(1, 'minutes');

            if(trackerData.length >= 1) {
                check = minusFive.isAfter(moment(trackerData[trackerData.length-1].timeStamp))
            } else {
                check = true
            }
            //Decide whether to push to notify user
            if(check) {
                //Update Tracker Array
                trackerData.push(ipInfo);

                let city = ipInfo.city ? `${ipInfo.city}, `:""

                //Make notification
                const trackerNotification = {
                    message: `${name ? name:"Someone"} accessed your Profile from ${city}${ipInfo.country_name}`,
                    active: true,
                    link: '/dashboard/tracker',
                    timeStamp: now
                }

                //Update Notification Array 
                notifications.push(trackerNotification);

                //Push both Updates to User DB
                let ref = await db.collection("users").doc(uid).update({
                    "trackerData": trackerData,
                    "notifications": notifications
                })
            }
        } catch (error) {
            return {error}
        }
        return {logged: true}
    }

    return logData()
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
    asyncModule.each(toSend, self.sendEmail, function() {
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
  asyncModule.waterfall([
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

asyncModule.series([
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
//          CONTACT FORM EMAIL / FEEDBACK EMAIL
// ==========================================================================

exports.contactForm = functions.https.onCall((data, context) => {
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

    if(data.values.feedback) {
        const { name, uid, email, subject, message, location } = data.values;

        let mailOptions = {
            from: "paynejosephanthony@gmail.com",
            to: "payne.joe@hotmail.co.nz, bennypayne12@gmail.com",
            subject: `Someone left Feedback on "${subject}"`,
            generateTextFromHTML: true,
            html: 
            `
                <h1>User Feedback</h1>
                <h3>Name: ${name}</h3>
                <h3>Email: ${email}</h3>
                <h3>Subject: ${subject}</h2>
                <p>Message: ${message}</p>
                <br />
                <br />
                <p>UID: ${uid}</p>
                <p>Location: ${location}</p>
            `
        };

        let feedbackEmail = () => {
            new Promise((resolve, reject) => {
                transporter.sendMail(mailOptions, (error, info) => {
                    if(error) { 
                        reject(error);
                        transporter.close(); 
                    } else { 
                        resolve(info);
                        transporter.close();
                    }
                })
            })
        }

        return feedbackEmail()

    } else {
        const { name, email, subject, message } = data.values;

        let mailOptions = {
            from: "paynejosephanthony@gmail.com",
            to: "payne.joe@hotmail.co.nz, bennypayne12@gmail.com",
            subject: `Contact Form Email - ${subject}`,
            generateTextFromHTML: true,
            html: 
            `
                <h1>Contact Form Submission</h1>
                <h3>Subject: ${subject}</h2>
                <h3>Name: ${name}</h3>
                <h3>Email: ${email}</h3>
                <p>Message: ${message}</p>
            `
        };

        let contactEmail = () => {
            new Promise((resolve, reject) => {
                transporter.sendMail(mailOptions, (error, info) => {
                    if(error) { 
                        reject(error);
                        transporter.close(); 
                    } else { 
                        resolve(info);
                        transporter.close();
                    }
                })
            })
        }

        return contactEmail()
    }
});
//End Contact Form Function

// ==========================================================================
//          User DB Instance Deletion
// ==========================================================================

exports.removeUserFromDatabase = functions.auth.user()
    .onDelete(function(event) {
    // Get the uid of the deleted user.
    var uid = event.uid;

    db.collection("users").doc(uid).delete()
    .then(function() {
        console.log("Document successfully deleted!");
    })
    .catch(function(error) {
        console.error("Error removing document: ", error);
    });

});
