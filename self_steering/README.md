# Self-Steering 3D Voronoi (Local Dev Folder)

This is a local copy of the 3D Voronoi app using a new self-steering motion model.

Run locally:

- npm run dev
- Open the /self_steering/ page in the dev server

Changes:

- New 4-pass pipeline (A/B/C/D + Common)
- Buffer C computes a steering axis from Voronoi geometry
- Buffer D smooths the signal and manages relax/steer phases

Next: push to the Self-Steering GitHub repo after testing.

