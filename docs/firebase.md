# Firebase configuration

This project relies on Firebase Authentication and Cloud Firestore. The following steps keep the hosted build aligned with the new security posture.

## Deploy updated security rules

After modifying `firestore.rules`, redeploy them to Firestore:

```bash
firebase deploy --only firestore:rules
```

This command requires the Firebase CLI to be authenticated against the `stick-fight-pigeon` project.

## Grant admin access

Administrative actions in the in-game panel require a custom claim named `admin` (or `stickfightAdmin`) on the Firebase Authentication user. You can assign the claim with the Firebase CLI or via an admin SDK script. Example using the CLI:

```bash
firebase auth:users:set-claims <ADMIN_UID> '{"admin": true}' --project stick-fight-pigeon
```

After the claim is set, the administrator should re-authenticate (or refresh their ID token) before using the admin panel.

## Authorized domains

Ensure the following domains are listed under **Authentication → Settings → Authorized domains** in the Firebase console:

- `stick-fight-pigeon.web.app`
- `stick-fight-pigeon.firebaseapp.com`

Requests originating from other domains will be blocked by Firebase Authentication.
