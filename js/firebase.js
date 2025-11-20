
var firebaseConfig = {
  apiKey: "AIzaSyC8-y2xnLINlVTWOOaU8-w82RBzSo2djAQ",
  authDomain: "labourcare-2481a.firebaseapp.com",
  projectId: "labourcare-2481a",
  storageBucket: "labourcare-2481a.appspot.com",
  messagingSenderId: "1033457212744",
  appId: "1:1033457212744:web:4d767eb4ef246b1090e77d"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Enable offline persistence for better performance and offline support
// This must be called before any Firestore operations
try {
  db.enablePersistence({
    synchronizeTabs: true
  }).catch((err) => {
    if (err.code == 'failed-precondition') {
      // Multiple tabs open, persistence can only be enabled in one tab at a time.
      console.warn('Persistence can only be enabled in one tab at a time.');
    } else if (err.code == 'unimplemented') {
      // The current browser does not support all of the features required for persistence
      console.warn('Persistence is not supported in this browser.');
    } else {
      console.warn('Error enabling persistence:', err);
    }
  });
} catch (error) {
  console.warn('Persistence initialization error:', error);
}
