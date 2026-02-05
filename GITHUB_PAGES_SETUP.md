# GitHub Pages Configuration Fix

## Problem

Real data has been committed to the `main` branch and the GitHub Actions workflow for deployment is running successfully, but the changes are not visible on the GitHub Pages site at `https://brian-foerster.github.io/EAGrantsDatabase/`.

## Root Cause

GitHub Pages is likely configured to serve from the wrong source. The repository has a GitHub Actions workflow (`.github/workflows/deploy.yml`) that builds and deploys the site, but GitHub Pages may be configured to use a different source like:
- A `gh-pages` branch
- The `docs/` folder on the main branch
- Another branch/folder combination

## Solution

GitHub Pages must be configured to use **GitHub Actions** as its deployment source.

### Step-by-Step Fix

1. **Navigate to Repository Settings**
   - Go to: `https://github.com/[username]/[repository-name]/settings/pages`
   - For this repository: https://github.com/Brian-Foerster/EAGrantsDatabase/settings/pages

2. **Change the Source**
   - Under **"Build and deployment"** section
   - Find the **"Source"** dropdown
   - Select **"GitHub Actions"** (NOT "Deploy from a branch")

3. **Save and Verify**
   - The change is automatically saved
   - Wait for the next deployment workflow to run (or trigger one manually)
   - The site should be available at: https://brian-foerster.github.io/EAGrantsDatabase/

### How to Trigger a Manual Deployment

If you want to trigger a deployment immediately after changing the settings:

1. Go to: `https://github.com/[username]/[repository-name]/actions/workflows/deploy.yml`
   - For this repository: https://github.com/Brian-Foerster/EAGrantsDatabase/actions/workflows/deploy.yml
2. Click the **"Run workflow"** button
3. Select the **"main"** branch
4. Click **"Run workflow"**

### Verification

After the workflow completes successfully:
- Visit `https://[username].github.io/[repository-name]/`
- For this repository: https://brian-foerster.github.io/EAGrantsDatabase/
- The site should display the grant database with real data
- You should see 4,715 grants from GiveWell in the database

## Current Status

✅ Data is committed to main branch (`data/ea-grants-database.csv` - 4,715 rows)  
✅ GitHub Actions workflow is configured correctly (`.github/workflows/deploy.yml`)  
✅ Workflow runs are completing successfully  
❌ GitHub Pages source needs to be set to "GitHub Actions"  

## Technical Details

The deployment workflow:
1. Triggers on push to `main` branch
2. Builds the Next.js static site with `npm run build`
3. Generates static HTML in the `out/` directory
4. Uploads the artifact to GitHub Pages
5. Deploys to GitHub Pages

The workflow has the correct permissions:
```yaml
permissions:
  contents: read
  pages: write
  id-token: write
```

## Alternative: If GitHub Actions is Already Selected

If GitHub Pages is already set to use GitHub Actions and the site still doesn't show updated data:

1. Check if there's a caching issue:
   - Try accessing the site in an incognito/private browser window
   - Hard refresh the page (Ctrl+Shift+R or Cmd+Shift+R)

2. Verify the latest deployment:
   - Go to: `https://github.com/[username]/[repository-name]/actions`
   - For this repository: https://github.com/Brian-Foerster/EAGrantsDatabase/actions
   - Check that the latest "Deploy to GitHub Pages" workflow completed successfully
   - Check the deployment URL in the workflow output

3. Check for errors:
   - Review the workflow logs for any errors during build or deployment
   - Verify that the `out/` directory is being created correctly
