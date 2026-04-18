Project context / implementation brief

I need help improving the environment / atmosphere architecture for my React Three Fiber site, `sakhalteam.github.io`.

This is not just a one-off visual tweak. I want the scene/environment layer of the site to become modular, reusable, and easy to extend across zones without creating a tangled mess of one-off files.

Please approach this as:

- first: understand the current setup
- second: propose a maintainable architecture
- third: implement the first useful slice in `zone-cloud-town`
- fourth: leave the codebase in a state where future enhancements are straightforward

---

## CURRENT SITUATION

The site is zone-based.

Important file to inspect:

- `scenemap.ts`

Important existing environment-related file to inspect:

- `CloudTownExtras.tsx`

Current state:

- `zone-cloud-town` already has a sky setup inspired by the Three.js Sky example and uses drei clouds
- the main Island scene already uses an R3F `Water.tsx` component that I like
- I want to add more environmental / atmospheric enhancements to multiple zones over time
- right now I do not want those concerns to stay trapped inside one zone-specific implementation like `CloudTownExtras.tsx`

Core problem:
I do not want future features like skies, clouds, time-of-day, weather, stars, atmosphere, fog, moon/sun, etc. to require rewriting a bunch of files or importing random zone-specific logic into unrelated places.

In other words:

- Island should not have to “borrow” environment logic from Cloud Town
- Bird Sanctuary should not depend on Cloud Town’s implementation details
- future zones should be able to opt into shared environment systems cleanly

I need the architecture to become more composable.

---

## HIGH-LEVEL GOAL

Create a reusable environment / atmosphere system for the site.

This should support the idea that different zones may eventually use different subsets of:

- sky
- clouds
- time of day
- weather
- stars
- moon / sun
- atmospheric lighting
- fog / haze
- ground ambiance / environmental dressing
- future drei / three / pmndrs components

I am not prescribing the exact component structure. I want you to inspect the codebase and propose the cleanest implementation.

---

## IMPORTANT DESIGN DIRECTION

Please do NOT just expose a bunch of low-level “sky math” controls like raw azimuth/exposure/turbidity-style values as the main UI.

That was already a pain point.

I want the architecture and user controls to be based more on semantic presets / art direction, such as:

- morning
- noon
- sunset
- night
- clear
- partly cloudy
- overcast
- rainy
- stormy

Internal low-level parameters can exist, but the visible control model should be intuitive.

---

## REFERENCE / INSPIRATION TO REVIEW

Please review these before deciding on architecture:

1. Three.js forum thread:
   https://discourse.threejs.org/t/complete-sky-system-for-three-js-skybox-sun-moon-day-night-cycle-clouds-stars-lensflares/88311

2. CodePen demo:
   https://codepen.io/the-red-reddington/full/MYKRZNN

My read on those references:

- they are useful inspiration for atmosphere, day/night cycle, sun/moon, clouds, stars, and visual cohesion
- but they do NOT necessarily provide the architecture I want to copy directly
- the CodePen appears to use custom sky/cloud shader logic and a time-driven atmosphere approach rather than a polished reusable “weather system”
- I want you to borrow ideas where useful, but still design the implementation for THIS codebase

Please use those references as inspiration, not as something to transplant blindly.

---

## ZONE-SPECIFIC GOALS

1. Island (main site)
   Current:

- already has water that I like

Need:

- should be able to gain reusable environment features later without depending on Cloud Town code
- eventually may want some combination of water + sky + stars + weather + atmosphere
- architecture should make this easy later

This zone does NOT need to be the first implementation target.
But the architecture should keep it in mind.

---

2. zone-bird-sanctuary
   Intent:

- this should feel like a forest scene
- generic pleasant weather only
- no user-facing weather controls
- no dramatic weather system here

What I want visually:

- some sense of forest floor / forest atmosphere / believable environmental framing
- possibly use some combination of environment / ground / fog / subtle backdrop treatment / lighting to make it feel forested

What I do NOT want:

- a dynamic weather playground
- rain/storm presets here
- unnecessary control UI

This zone should likely consume a limited / stable subset of the shared environment architecture.

---

3. zone-cloud-town
   This is the main prototype zone for the new system.

Current:

- already has a sky/sun/cloud vibe I like

Goal:

- make this the first place where the new time-of-day / atmosphere / weather architecture gets tested

Desired user-facing controls eventually:

- time of day
- weather presets
- maybe stars
- maybe moon
- maybe rain later
- maybe thunderstorm / lightning later
- maybe thunder SFX later

Important:
I do NOT want the control model to be based on fiddly raw parameters.
I want a clean, game-like settings panel that opens from an icon/button and closes again when toggled.

The UI should feel more like:

- a compact settings popover / panel
- semantic options
- easy to understand
- not always-on debug clutter

Cloud Town should become the “testbed” for this system.

---

## FUTURE ENHANCEMENTS TO KEEP ROOM FOR

Do not necessarily implement all of these now, but leave room for them architecturally:

- better overcast simulation
- stars
- moon
- rain
- lightning
- thunder audio
- more advanced cloud behavior
- additional atmospheric effects
- future drei / three-based environment helpers or custom shader systems
- zone-specific environment profiles with shared underlying infrastructure

---

## WHAT I NEED FROM YOU

Please do the following:

1. Inspect the current relevant files and summarize how the environment-related code is currently organized

2. Identify the architectural problems / coupling problems in the current setup

3. Propose a clean reusable structure for environment systems in this codebase
   - shared systems vs zone wrappers
   - what should be generic
   - what should stay zone-specific

4. Implement the first pass in `zone-cloud-town`

5. Add a simple user-facing settings UI for Cloud Town
   - toggle open/closed from an icon/button
   - semantic controls, not raw shader/debug controls

6. Keep the implementation maintainable and extensible
   - future zones should be able to opt into pieces of this without major rewrites

7. After implementation, explain:
   - what was changed
   - why this structure is better
   - how Island would hook in later
   - how Bird Sanctuary would hook in later

---

## IMPORTANT CONSTRAINTS

Optimize for:

- maintainability
- modularity
- visual cohesion
- decent performance
- ease of future editing
- avoiding giant rewrites later

Please do not treat this as “just make Cloud Town prettier.”
Treat it as the start of a reusable environment layer for the whole site.

Also:
I am intentionally not over-specifying the exact code structure because I want you to make smart architectural decisions after reading the existing files.
