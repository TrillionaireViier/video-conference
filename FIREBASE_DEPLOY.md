# Deploying Video Conference with Firebase

Firebase Hosting serves the static React frontend. The Socket.IO signaling and PeerJS server must stay on a persistent Node.js service; deploy that backend to Google Cloud Run (the Google Cloud service used alongside Firebase). Firebase Hosting alone cannot run this backend.

## 1. Deploy the signaling backend to Cloud Run

From the repository root, authenticate with Google Cloud (`gcloud auth login`) and select a Google Cloud project linked to your Firebase project (`gcloud config set project YOUR_PROJECT_ID`). Then deploy:

```bash
gcloud run deploy video-conference-signaling \
  --source backend \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars CORS_ORIGIN=https://YOUR_PROJECT_ID.web.app
```

Copy the HTTPS service URL printed by Cloud Run, for example `https://video-conference-signaling-xxxxx-uc.a.run.app`.

## 2. Build the frontend with the backend URL

```bash
VITE_SIGNALING_SERVER_URL=https://YOUR_CLOUD_RUN_URL npm --prefix frontend run build
```

Replace `YOUR_CLOUD_RUN_URL` with the Cloud Run URL from step 1 (without a trailing slash).

## 3. Deploy the frontend to Firebase Hosting

Install and sign in to the Firebase CLI if needed (`npm install -g firebase-tools`, `firebase login`), then deploy from the repository root:

```bash
firebase deploy --only hosting --project YOUR_PROJECT_ID
```

`firebase.json` configures the SPA rewrite and runs the frontend build before Hosting deploy. Set `VITE_SIGNALING_SERVER_URL` in the shell before running the deploy command so the build embeds the public signaling URL. The deployed site will be available at `https://YOUR_PROJECT_ID.web.app`.

## Notes

- Set `CORS_ORIGIN` to the actual Firebase Hosting origin if you use a custom domain.
- The backend uses the configured database only for optional room history; signaling itself can run without `DATABASE_URL`.
- WebRTC media is peer-to-peer. Some restrictive networks require a TURN service in addition to the signaling backend.
- The existing Render blueprint is not used by this Firebase Hosting + Cloud Run deployment path.
