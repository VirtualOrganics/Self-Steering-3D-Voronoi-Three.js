# 3D Voronoi Voxel Visualization

🎮 **[Live Demo](https://virtualorganics.github.io/3D-Voronoi-Voxel-GLSL-Three.js/)** | 📦 **[GitHub Repository](https://github.com/VirtualOrganics/3D-Voronoi-Voxel-GLSL-Three.js)**

A real-time 3D Voronoi diagram renderer using Three.js and GLSL, featuring voxel-based acceleration and dynamic animation.

## Features

- **Real-time 3D Voronoi cells** with 100 animated seed points
- **Voxel grid acceleration** (64³ grid) for efficient raymarching
- **Dithered transparency** using Bayer matrix patterns
- **Interactive controls** for visual parameters
- **Mouse rotation** (drag to rotate view)
- **White edges** where 3+ cells meet
- **Optional site point visualization**
- **Size-based or random coloring**

## Installation

```bash
npm install
npm run dev
```

Then open http://localhost:5173 in your browser.

## Building for Production

```bash
npm run build
```

The built files will be in the `dist` directory.

## Technical Details

The visualization uses three render passes:
1. **Buffer A**: Animates Voronoi site positions
2. **Buffer B**: Maintains voxel acceleration structure via Jump Flooding Algorithm
3. **Main**: Raymarches through the structure with visual effects

### Key Algorithms

- **Jump Flooding Algorithm (JFA)**: Efficiently computes the 3D Voronoi diagram in parallel
- **Voxel Acceleration**: Reduces site checks from 100 to 4 per ray step
- **Dithered Transparency**: Screen-space ordered dithering without alpha blending
- **Soft Boundaries**: Sites are repelled from edges rather than hard-clamped

## Controls

- **Mouse**: Drag to rotate the cube (horizontal and vertical)
- **Cell Opacity**: Adjust transparency of cell faces
- **Movement Speed**: Control animation speed
- **Edge Sharpness**: Adjust crispness of edges
- **Show Site Points**: Toggle white spheres at Voronoi centers
- **Smooth Edges**: Toggle between smooth/hard edge transitions
- **Size-Based Color**: Switch between random colors and size-based toning

## Architecture

### Shader Pipeline
1. **Common**: Shared utilities and constants
2. **Buffer A**: Site position animation with Perlin noise
3. **Buffer B**: Voxel grid generation with JFA
4. **Main**: Raymarching renderer with effects

### Optimization Techniques
- Voxel grid reduces computation by ~25x
- Complete JFA passes in single frame to prevent flickering
- Adaptive ray stepping based on distance
- Local space calculations for efficiency

## Based on

Original Shadertoy implementation with voxel acceleration and dithered transparency.

## License

MIT 