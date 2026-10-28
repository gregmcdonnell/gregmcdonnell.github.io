---
title: GPU Particle Collisions
date: 2024-04
description: A real time simulation of massive numbers of 2D and 3D particles with full collisions executed with GPU compute shaders.
tags: [simulation, physics, particles, fluid, collision, gpu, graphics, unity]
featured: true
image: /assets/images/gpu-particle-collisions/gpu-particles-1.png
---

Particle simulations are ubiquitous in today’s media, and there is no shortage of software to choose from to add them to your game, movie, or app. Yet rather than rely on existing tools, I set out to build my own system from scratch—both to demystify the underlying mechanics and to push the boundaries of how many particles I could get flying around on my screen.

<img class="fit-image" src="/assets/images/gpu-particle-collisions/gpu-particles-1.png" alt="Thousands of colliding particles" />

## Particle Interaction Model

The simulation I aimed to create would be real time and physics based, and the goal was to simulate and render thousands to millions of particles with accurate collisions while maintaining a smooth framerate. In order to reach these numbers, we need to take advantage of parallelization and run the simulation directly on the GPU. I decided on the following rules to govern how the particles behaved and interacted:

- Particles are defined as circles with a 2D position and a radius
- Collisions are modeled as a damped spring force between the two particles based on the overlap distance of the two particles
- Particles are confined within a square boundary

Below is some hlsl code to calculate the collision force between any two particles.

```hlsl
float2 CollisionForce(Particle particleA, Particle particleB)
{
    float2 r = particleB.pos - particleA.pos;
    float distanceBetweenCenters = length(r);
    r = r / distanceBetweenCenters;
    float overlapDistance = (particleA.radius + particleB.radius) - distanceBetweenCenters;
    if (overlapDistance  > 0) // they've collided
    {
        float springForce = springConstant * overlapDistance;
        return r * springForce;
    }
    // otherwise no collision, return no force
    return float2(0, 0);
}
```

This mutual force is applied in opposite directions to the two particles. Looking at the direction of our vector r, the force vector returned by this function is applied to particle B and it’s negative is applied to particle A.

<img class="fit-image" src="/assets/images/gpu-particle-collisions/particles2d-collide-force.gif" alt="Collision force between two particles" />

Most collisions are not perfectly elastic, so we’d also like a way to introduce some energy loss in the system. Let’s add a damping factor that damps the restoring spring force depending on the relative speed between the two particles.

```hlsl
if (overlapDistance  > 0) // they've collided
{
    float springForce = springConstant * overlapDistance;
    float2 velocityDiff = particleB.vel - particleA.vel;
    float dampForce = dampingConstant * dot(r, velocityDiff);
    return r * (springForce - dampForce);
}
```

We can make collisions appear more rigid and instantaneous by increasing the spring constant. However, if we choose too large of a timestep with a large spring constant, the simulation will tend to become unstable. We can mitigate this by decreasing the timestep and running multiple steps per frame to maintain simulation rate.

In this simplified model where we don’t define any rotation for the particles, all forces must be along the radial line between the two particle centers. This means that we cannot realistically add any tangential forces like friction between the two particles as this would generate a torque on the particles. If we wanted a system with friction, we would simply give particles an angle and angular velocity and calculate torques in collision interactions (the angle is not used in computations since circles are fully rotationally symmetric).

## Performant Collision Checks

But how do we determine which pairs of particles need to be checked for a collision? The simplest way would be to just check every particle against every other particle, or more accurately every unique pair. If we have `N` particles, this results in `N * (N - 1) / 2` pairs, and hence, collision checks. This quickly becomes very computationally expensive, even when the entire simulation is on the GPU.

An efficient solution is to subdivide the 2D space into discrete blocks so that we only need to check particles in a given block against particles in neighboring blocks. One common way of discretizing a 2D space is with a [quadtree](https://en.wikipedia.org/wiki/Quadtree), but I chose to use a fixed grid for a simpler implementation.

<img class="fit-image" src="/assets/images/gpu-particle-collisions/unity_6ngwejjxn7.png" alt="Particles divided into a grid of blocks" />

The size of each block in the grid depends on the size of the particles. The most efficient setup is to set the block size to diameter of the particles, or if particles vary in size then the block width must be no smaller than the largest diameter. Some inspection will reveal that this setup will ensure that only neighboring blocks can contain overlapping particles.

This grid is represented on the graphics card as a structured buffer of blocks (or bins). Each bin holds a list of integers referring to particle indices. To conserve memory, we limit each bin to hold a maximum of 16 integers, and we also keep track of the current count of particles in each bin. After the particle position update, we calculate which bin contains its position with a simple divide and floor and then append the particle’s index to that bin and increase the bin count. As with any value that can be accessed and written to by multiple threads on the GPU, we need to use some interlocked functions like hlsl’s `InterlockedAdd()` and `InterlockedMin()` functions to ensure atomic operations when multiple particles are being added to the same bin concurrently.

If the density of particles ever becomes so great that there are more than 16 particles within the same block, we simply miss some collisions. But this is a rare occurrence, and if it does happen, the pressure and speed of the particles in that region are so great that the chaos hides the inaccuracies.

We can now run a GPU dispatch over all of the pairs of neighboring bins and only run collision checks on particles in those bins. This vastly reduces the number of collision checks and boosts performance significantly.

We now have a system set up to simulate particle collisions very efficiently. We calculate the collision forces on each particle in the manner described above and this force is added to the given particle’s force variable. Since this force variable can be written to concurrently when a given particle has multiple simultaneous collisions, it too must be updated with an InterlockedAdd(), and thus must be of type int2 since we can only do interlocked addition on integers. We can then update the velocity and position of each particle using simple Euler integration.

Particles are drawn with Unity’s `Graphics.DrawMeshInstancedIndirect()`. This allows us to draw a large number of meshes (in this case simple quads with a circle texture) in a single draw call. The method simply tells the GPU to draw the same mesh a given number of times and we can pass a buffer that holds all of the particle positions into a custom shader to specify where to render each quad.

<figure>
  <img class="fit-image" src="/assets/images/gpu-particle-collisions/granular_gpu_3g9rqcc8rw.png" alt="Particles packed into a crystal lattice" />
  <figcaption>Particles pack into crystal lattices with imperfections like linear dislocations and holes.</figcaption>
</figure>

<div style="padding:56.25% 0 0 0;position:relative;"><iframe src="https://player.vimeo.com/video/1029007839?badge=0&amp;autopause=0&amp;player_id=0&amp;app_id=58479" allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media; web-share" referrerpolicy="strict-origin-when-cross-origin" style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;" title="2D Particle Collisions Clip 1"></iframe></div>

<iframe style="width:100%; aspect-ratio: 16 / 9; border:0;" src="https://www.youtube.com/embed/xxWqL5SXYUI?si=eqm4YfTlc7S7IoZn" title="YouTube video player" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>
