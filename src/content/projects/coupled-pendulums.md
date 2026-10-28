---
title: Coupled Pendulums
date: 2025-06
description: A quick javascript simulation of a line of pendulums coupled with angular springs.
tags: [physics, pendulums, spring]
featured: true
image: /assets/images/coupled-pendulums/coupled-pend-1.png
simulation: coupled-pendulums
---

This was intended to be a small project to integrate a relatively simple physics simulation with Three.js used as the graphics engine, primarily to become familiar with the Three.js library. I chose to model a simple chain of coupled pendulums as a starting point.

<img class="fit-image" src="/assets/images/coupled-pendulums/coupled-pend-1.png" alt="Chain of coupled pendulums" />

We can imagine coupling pendulums in a variety of ways, but I opted for a simple angular spring based form of coupling. Each pendulum is modeled as a rigid rod with a mass on the end (the bob). A pendulum is coupled to its next neighbor by an angular spring that applies a mutual torque to both pendulums in proportion to the difference in angle, with the proportional strength being controlled by the spring constant. This is simply $\tau = k \Delta \theta$, which we might note is the same form of equation for masses linearly connected by a spring.

$$
\frac{d^2\vec{x}}{dt^2} \propto \Delta \vec{x}
$$

Many different physical systems share this same underlying physical principle, stated in the equation above, often where a force is proportional to the difference in position. This form of equation describes a system of coupled harmonic oscillators, like our pendulums, but also lattice vibrations in a solid, some molecular dynamics, wave propagation in a discrete medium (approximated water or sound waves), and even a rough model of electromagnetic fields. Much of the universe can be modelled by thinking in terms of springs.
