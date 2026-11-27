# Code 3

Line tracker for an 18-station ambulance build line: build line (1–15), outside services, TAG line (16–18) and Final Line, with a live plant floor map.

- Email and password accounts with password reset (Firebase Authentication)
- Roles set by the admin on the People screen: Admin, Supervisor, Employee (view only)
- New sign-ups have no access until an admin gives them a role
- Roles are enforced by the Firestore security rules in `firestore.rules`

Files: `index.html` (the app), `fb.js` (Firebase connection, bundled), `firestore.rules` (paste into Firestore → Rules).
