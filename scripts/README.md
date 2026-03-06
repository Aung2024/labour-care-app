# Admin Scripts

## Update User Email

Updates a user's sign-in email in Firebase Auth and Firestore. No Blaze plan required.

### Setup (one-time)

1. **Get your service account key**
   - Go to [Firebase Console](https://console.firebase.google.com) → your project
   - Click the gear icon → **Project settings**
   - Open the **Service accounts** tab
   - Click **Generate new private key** → **Generate key**
   - Save the downloaded JSON file as `scripts/serviceAccountKey.json`

2. **Install dependencies**
   ```bash
   cd scripts
   npm install
   ```

### Usage

**Option A: Command line**
```bash
cd scripts
node update-user-email.js <userId> <newEmail>
```

Example:
```bash
node update-user-email.js RTMufBmHXfTv2iHM0ztY4HumBV73 npt@gmail.com
```

**Option B: Interactive (prompts for input)**
```bash
cd scripts
node update-user-email.js
```

### Finding the User ID

- **Firebase Console** → Authentication → Users → click a user → copy the **User UID**
- **Firestore** → `users` collection → the document ID is the user ID

### Security

- **Never commit** `serviceAccountKey.json` to git (it's in .gitignore)
- Keep the key file private and secure
