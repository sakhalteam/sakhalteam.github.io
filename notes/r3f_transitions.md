# R3F Scene Transitions — Digestible Notes

Source transcript: user-provided text. fileciteturn0file0

## What this is about

This technique creates **scene-to-scene transitions in React Three Fiber** by:

1. Rendering **scene state A** into **texture A**
2. Rendering **scene state B** into **texture B**
3. Drawing a **fullscreen plane**
4. Using a **custom shader** on that plane to blend or mask between the two textures

That means the transition is not happening by directly crossfading meshes in the world.
It is happening by transitioning between **two rendered images of the world**.

---

## Core mental model

Think of it like this:

- You have one camera that captures your 3D scene
- You render the scene twice in the same frame:
  - once with setup A visible
  - once with setup B visible
- Each render is saved into a **render target**
- Those render targets become textures
- A shader on a fullscreen quad decides how much of texture 1 vs texture 2 to show

So the pipeline is:

**3D scene → render target 1 / render target 2 → fullscreen shader plane → screen**

---

## Why use this approach?

Because once both scene versions are textures, you can do almost any transition you want in the shader:

- wipe
- vertical/horizontal reveal
- noise breakup
- dissolve
- displacement distortion
- wave transitions
- pixelation
- blur-based reveals
- anything else you can write in GLSL

This is what makes the method powerful.

---

## What is being transitioned?

In the tutorial example, it is not necessarily two entirely different scenes.

It can be:

- the same scene with different materials
- the same scene with different visible objects
- two completely different scenes
- two different states of one environment

Example:

- mode 0 = one floor, one wall set, certain props visible
- mode 1 = different floor/walls, different props visible
- mode 2 = yet another setup

The transition shader only sees two textures. It does not care how those textures were created.

---

## Important setup idea

There are effectively **two cameras involved conceptually**:

### 1. Render camera

This is the camera that captures the 3D scene into the render targets.

### 2. Main/display camera

This is the actual camera rendering the fullscreen plane to the screen.

That is why camera motion can still feel correct: the render camera moves through the scene, while the viewer is really seeing the shader plane.

---

## Render target workflow

Each frame, the app does roughly this:

### Pass 1 — render “current” scene state

- Make the render scene visible
- Apply materials for the current mode
- Set object visibility for the current mode
- Set renderer target to renderTarget1
- Render scene with renderCamera

### Pass 2 — render “next” scene state

- Apply materials for the next mode
- Set object visibility for the next mode
- Set renderer target to renderTarget2
- Render scene with renderCamera

### Final pass — render to screen

- Hide the original 3D scene from normal display
- Reset renderer target to default (`null`)
- Render a fullscreen plane
- The plane’s shader receives:
  - texture 1
  - texture 2
  - progress
  - transition type / effect params

---

## The fullscreen plane

A fullscreen plane is used because it gives you a simple surface to run a fragment shader on.

That shader has access to:

- the UV coordinates of the plane
- both rendered scene textures
- a progress value, usually `0 → 1`

From there, the shader decides which pixels come from texture A and which come from texture B.

---

## Simplest possible transition

The transcript’s basic example is a wipe.

### Horizontal wipe

Use the x-coordinate of the plane UV:

- left side shows texture A
- right side shows texture B
- the boundary moves as `progress` changes

### Vertical wipe

Same idea, but use the y-coordinate.

Pseudo-logic:

```glsl
vec4 tex1 = texture2D(uTexture1, vUv);
vec4 tex2 = texture2D(uTexture2, vUv);

float mask = step(vUv.x, uProgress); // horizontal example
vec4 finalColor = mix(tex1, tex2, mask);
```

This is conceptually the whole trick, even if the real shader is written slightly differently.

---

## Where the interesting part lives

The important creative work is in the **fragment shader**.

That is the place to replace a boring wipe with something more sophisticated.

Instead of:

- `mask = step(vUv.x, progress)`

you could do:

- noise-based thresholds
- displacement-offset UVs
- radial masks
- edge blur
- dissolve thresholds
- sine-wave distortions
- directional smear
- chromatic breakup
- pixel blocks

In other words, the render-target setup is infrastructure.
The shader is the actual transition design.

---

## Scene-state switching pattern

The tutorial’s example uses a GLB environment and swaps state by:

### Materials

Objects with names like:

- `floor`
- `wall`

can receive materials like:

- `floor0`, `floor1`, `floor2`
- `wall0`, `wall1`, `wall2`

### Visibility groups

Certain props are shown or hidden depending on the current mode.

That gives each mode a different look without needing separate scene files.

---

## Blender/export note

A useful practical point from the transcript:

If a material is not used anywhere in Blender, it may not get exported with the GLB.

The workaround mentioned was to assign unused materials to hidden or out-of-view geometry so they still get included in export.

Ugly, but effective.

---

## Basic R3F structure

A project using this pattern usually has:

### 1. A loaded GLTF scene

Using `useGLTF(...)`

### 2. A render scene reference

The scene that will be rendered into textures

### 3. A render camera

Usually a dedicated `PerspectiveCamera`

### 4. Two render targets

Typically created with `useFBO()` or Three.js render target classes

### 5. A shader material

Receives:

- texture A
- texture B
- progress
- transition params

### 6. A fullscreen mesh

Usually a plane that fills the viewport

### 7. A `useFrame(...)` loop

This runs the multi-pass rendering each frame

---

## High-level pseudo-code

```tsx
useFrame(({ gl }) => {
  // show render scene
  renderScene.visible = true;

  // pass 1: current mode
  applyMaterials(currentMode);
  applyVisibility(currentMode);
  gl.setRenderTarget(rt1);
  gl.render(renderScene, renderCamera);

  // pass 2: next mode
  applyMaterials(nextMode);
  applyVisibility(nextMode);
  gl.setRenderTarget(rt2);
  gl.render(renderScene, renderCamera);

  // hide original scene from default render
  renderScene.visible = false;

  // final pass to screen
  gl.setRenderTarget(null);

  transitionMaterial.uniforms.uTexture1.value = rt1.texture;
  transitionMaterial.uniforms.uTexture2.value = rt2.texture;
  transitionMaterial.uniforms.uProgress.value = progress;
});
```

---

## What `progress` does

`progress` is the transition amount, usually in the range:

- `0` = fully show scene A
- `1` = fully show scene B

Anything between 0 and 1 shows a mix/mask between them.

You can animate it with:

- `lerp`
- spring animation
- GSAP
- React state + easing
- any timeline system

The tutorial also mentions a transition speed parameter. That simply controls how quickly progress changes.

---

## Good way to think about customization

Split the system into two parts:

### Part A — scene authoring

What does each mode look like?

- which props are visible?
- what materials are assigned?
- where is the camera?

### Part B — transition design

How do we move from mode A to mode B?

- wipe?
- dissolve?
- wave?
- noisy breakup?

That separation is useful because it keeps the scene logic clean and the visual effect isolated in the shader.

---

## Practical implementation checklist

## 1. Prepare two scene states

Decide what changes between modes:

- materials
- visibility
- transforms
- full scene swaps

## 2. Create two render targets

You need one texture for the current state and one for the next state.

## 3. Add a fullscreen plane

This plane will display the transition result.

## 4. Write a shader material

At minimum:

- `uTexture1`
- `uTexture2`
- `uProgress`

Optional:

- transition direction
- noise texture
- displacement texture
- edge softness
- distortion amount

## 5. In `useFrame`, render both states every frame

First into RT1, then RT2.

## 6. Feed both textures into the shader

Set uniforms each frame.

## 7. Animate `uProgress`

When the user changes mode, animate progress from 0 to 1.

## 8. When finished, update the “current mode”

After the transition completes:

- current becomes next
- reset progress if needed
- prepare the next transition target

---

## Common gotchas

### Rendering the actual 3D scene and the plane at the same time

If you do not hide the original scene appropriately, you may see both the world and the fullscreen plane, which breaks the illusion.

### Forgetting to reset the render target

After rendering to `rt1` and `rt2`, you must switch back to the default target:

```ts
gl.setRenderTarget(null);
```

### Materials not exported from Blender

Unused materials may disappear from the GLB export.

### Camera confusion

The scene camera and the final display camera are doing different jobs. Keeping that mentally separated helps a lot.

### Overbuilding the transition too early

Get the plain wipe working first. Then make it fancy.

---

## Best upgrade paths after the basic wipe

Once horizontal/vertical wipe works, the most promising next steps are:

### Noise dissolve

Use a noise value per pixel and compare it to progress.

### Displacement transition

Offset the UVs of one or both textures using a displacement map.

### Edge feathering

Instead of a hard threshold, soften the blend boundary.

### Directional distortion

As the transition edge moves, distort pixels near the edge.

### Radial reveal

Transition from center outward, or vice versa.

These all use the exact same render-target foundation.

---

## Best distilled takeaway

The entire technique can be summarized like this:

> Render two versions of your scene into textures, then let a shader decide how to reveal one texture over the other.

That is the core idea.

---

## Minimal architecture summary

- **3D content** lives in a normal scene
- **Mode A** and **Mode B** are rendered separately
- Each render goes into its own **render target**
- A **fullscreen quad** displays both textures
- A **fragment shader** blends/masks between them using `progress`

---

## If you were building this yourself

A sensible build order would be:

1. Load one GLB scene
2. Create two modes by swapping materials/visibility
3. Render each mode into its own target
4. Display one fullscreen plane
5. Make a basic horizontal wipe shader
6. Animate `progress`
7. Only then experiment with fancy shader logic

That keeps the debugging surface small.

---

## One-sentence version

**Scene transitions in R3F are often easiest when you stop thinking in terms of meshes and start thinking in terms of two rendered textures plus one shader.**
