const admin = require('firebase-admin');

const serviceAccount = require('../service account.json'); // Updated path

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: 'gridrr-storage.firebasestorage.app' // <-- never change this name to appspot because its no longer working remember that 
});

const bucket = admin.storage().bucket();

console.log('Firebase Admin initialized. Bucket:', bucket.name);

module.exports = { admin, bucket }; 