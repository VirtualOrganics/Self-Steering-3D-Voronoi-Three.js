# GitHub Pages Setup Instructions

## Automatic Deployment Setup

The repository is already configured with GitHub Actions for automatic deployment. To enable GitHub Pages:

1. **Go to your repository on GitHub**: https://github.com/VirtualOrganics/3D-Voronoi-Voxel-GLSL-Three.js

2. **Navigate to Settings**:
   - Click on the "Settings" tab in your repository

3. **Enable GitHub Pages**:
   - Scroll down to the "Pages" section in the left sidebar
   - Under "Source", select "GitHub Actions"
   - Click Save

4. **Wait for Deployment**:
   - The GitHub Action will automatically run and deploy your site
   - This typically takes 2-3 minutes for the first deployment
   - You can check the progress in the "Actions" tab

5. **Access Your Live Demo**:
   - Your site will be available at: https://virtualorganics.github.io/3D-Voronoi-Voxel-GLSL-Three.js/
   - The URL is already added to the README

## Manual Deployment (Optional)

If you prefer to deploy manually:

```bash
# Build the project
npm run build

# The built files will be in the dist/ directory
# Upload these to any static hosting service
```

## Updating the Live Demo

Any push to the `main` branch will automatically trigger a new deployment through GitHub Actions.

## Troubleshooting

- If the page shows 404, ensure GitHub Pages is enabled in Settings
- If styles/scripts don't load, check that the base path in `vite.config.js` matches your repository name
- Check the Actions tab for any deployment errors 