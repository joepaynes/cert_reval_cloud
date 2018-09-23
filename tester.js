// const functions = require('firebase-functions');
const moment = require('moment');
const admin = require('firebase-admin');
// admin.initializeApp(functions.config().firebase);

var db = admin.firestore();


var certRef = db.collection('certs');

//Query DB

// Returns all 'D001' etc.
var certIDs = [];
var allCerts = certRef.get()
    .then(snapshot => {
        snapshot.forEach(doc => {
            var UIDRef = db.collection('certs').doc(doc.id).collection('holders');
            var certUIDs = UIDRef.get()
                .then(snapshot => {
                    snapshot.forEach(doc => {
                        console.log(doc.id);
                    });
                })
        })
    })
    .catch(err => {
        console.log('Error getting documents', err);
    });
        



// .then(snapshot => {
//     snapshot.forEach(doc => {
//     var UIDRef = db.collection('certs').doc(doc.id).collection('holders');
//     certIDs.push(UIDRef.get().then(console.log(certIDs)));
//     });
// })
// .catch(err => {
// console.log('Error getting documents', err);
// });