// Firebase web config. These values identify the project and are meant to be public;
// access is controlled by the Firestore rules in firestore.rules.
// Leave apiKey empty to run without accounts (local-only).

export const firebaseConfig = {
  apiKey: 'AIzaSyAfFfdSJdTs0bPV6agYZ__F1YyyADrk_CU',
  authDomain: 'do-date-618bc.firebaseapp.com',
  projectId: 'do-date-618bc',
  storageBucket: 'do-date-618bc.firebasestorage.app',
  messagingSenderId: '53359046628',
  appId: '1:53359046628:web:ef65abed9248bf15a2e1f1',
};

export const cloudEnabled = !!firebaseConfig.apiKey;
