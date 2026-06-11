> **SUPERSEDED — June 2026. Historical reference only. NEVER BUILD FROM THIS DOCUMENT.**
> Superseded by: nothing in DM; Google auth is owned by Kinetiks platform integrations
> Authority and merge map: dark-madder-v2-doc-system.md (Dark Madder v2 Documentation System Plan)

# Google Service Account Setup

Connect Google Search Console and GA4 to Dark Madder for analytics tracking.

## Step 1: Create a Google Cloud Project

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Click the project dropdown at the top left
3. Click "New Project"
4. Name it "Dark Madder Analytics" (or whatever you prefer)
5. Click "Create"
6. Make sure the new project is selected in the dropdown

## Step 2: Enable the APIs

You need to enable two APIs in your project.

1. Go to APIs & Services > Library (or search "API Library" in the top search bar)
2. Search for **"Google Search Console API"**, click it, click **Enable**
3. Go back to the Library, search for **"Google Analytics Data API"**, click it, click **Enable**

## Step 3: Create a Service Account

1. Go to IAM & Admin > Service Accounts (or search "Service Accounts" in the top search bar)
2. Click **"Create Service Account"**
3. Name: `dark-madder-reader` (or whatever you want)
4. Click **"Create and Continue"**
5. Skip the "Grant this service account access" step (click Continue)
6. Skip the "Grant users access" step (click Done)

## Step 4: Download the JSON Key

1. Click on the service account you just created
2. Go to the **Keys** tab
3. Click **Add Key > Create new key**
4. Select **JSON**
5. Click **Create**
6. A JSON file will download to your computer. Keep this file safe.

## Step 5: Add the Service Account to Search Console

1. Open the downloaded JSON file in a text editor
2. Find the `client_email` field. It looks like: `dark-madder-reader@your-project.iam.gserviceaccount.com`
3. Copy that email address
4. Go to [Google Search Console](https://search.google.com/search-console)
5. Select your property
6. Go to **Settings > Users and permissions**
7. Click **Add user**
8. Paste the service account email
9. Set permission to **Full**
10. Click **Add**

## Step 6: Add the Service Account to GA4

1. Go to [Google Analytics](https://analytics.google.com)
2. Select your property
3. Click **Admin** (gear icon, bottom left)
4. Under Property, click **Property Access Management**
5. Click the **+** button > **Add users**
6. Paste the same service account email
7. Set role to **Viewer**
8. Uncheck "Notify new users by email" (service accounts can't receive email)
9. Click **Add**

## Step 7: Find Your GA4 Property ID

1. In Google Analytics, click **Admin**
2. Under Property, click **Property Settings**
3. Your Property ID is the number at the top (e.g., `123456789`)
4. Copy this number

## Step 8: Enter Credentials in Dark Madder

1. Go to your org's **Settings** page in Dark Madder
2. Scroll down to the **Analytics** section
3. **Service Account JSON**: Open the downloaded JSON file, select all the text, paste it into the textarea
4. **Search Console Site URL**: Enter your website URL exactly as it appears in Search Console (e.g., `https://yoursite.com`)
5. **GA4 Property ID**: Paste the property ID number from Step 7
6. Click **Save Credentials**
7. Click **Test connection** for both GSC and GA4 to verify they work

## Troubleshooting

**"Permission denied" on test connection:**
- Make sure you added the service account email (not your personal email) to both Search Console and GA4
- It can take a few minutes for permissions to propagate

**"API not enabled" error:**
- Go back to Google Cloud Console and verify both APIs are enabled in your project

**"Invalid credentials" error:**
- Make sure you pasted the entire JSON file contents (including the curly braces)
- Check that you downloaded the key for the correct service account
