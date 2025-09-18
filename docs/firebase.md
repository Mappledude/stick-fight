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

To grab the administrator UID before running these scripts, check the server logs for a line that looks like `[AUTH] result code=ok uid=<ADMIN_UID>`. Copy the value that appears after `uid=` and supply it to the script.

You can also apply the claim locally with Node.js:

```bash
node tools/set-claim.js <ADMIN_UID>
```

On success, the script prints `Admin claim set for UID: <ADMIN_UID>`.

## Authorized domains

Ensure the following domains are listed under **Authentication → Settings → Authorized domains** in the Firebase console:

- `stick-fight-pigeon.web.app`
- `stick-fight-pigeon.firebaseapp.com`

Requests originating from other domains will be blocked by Firebase Authentication.

## Acceptance evidence

- Updated Firestore rules to use the new authentication model for rooms, players, and signals.
- Attempted to redeploy the rules with `firebase deploy --only firestore:rules --project stick-fight-pigeon`; complete the command from an authenticated environment to publish the changes.
