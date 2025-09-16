# light-odometer ![NPM Version](https://img.shields.io/npm/v/light-odometer)

This project is made only for personal use, as a small and lightweight build of [tm-odometer](https://github.com/mtmarco87/tm-odometer), which is itself a fork of [HubSpot's odometer](https://github.com/HubSpot/odometer).  
Do not use this, use [@mtmarco87](https://github.com/mtmarco87)'s package instead.  
Huge props to him for this TypeScript refactor !

No theme is shipped here, no docs either.

## What's changed ?
For a quick overview in a real-world usage, see https://github.com/EDM115/website/blob/master/app/components/ui/Odometer.vue

- Removal of all built artifacts, themes, demo, screenshots and CoffeeScript code
- Switch from Rollup to tsdown (Rolldown)
- Added linting and formatting (OxLint + ESLint Stylistic)
- Keep only the ESM build and switch to a default export
- Better TS config and stricter types (no more `any` nor `as`)
- Target ES2016 instead of ES2015
- Remove compatibility layers (Internet Explorer, jQuery)
- Stabilize and simplify the interfaces
- Use overall more optimized methods
- Renamed from `TmOdometer` to `LightOdometer`
- No more const functions
- SSR friendly (you can import it top-level without blowing up) and use safe fallbacks fror browser-land functions
- Multiple performance improvements
- `value` is now stripped from spaces
- Each instance can now have an `id`
- Ability to customize the framerate
  ```ts
  const odo = new LightOdometer({ ..., framerate: 20 }) // default is 30, going above isn't recommended
  // use countFramerate if you use the `count` mode instead of `slide`
  ```
- Ability to render once and destroy the instance
  ```ts
  const odo = new LightOdometer({ ..., value: 0 })
  odo.animateOnceAndDisconnect(12345)
  ```
- Expose `duration` as a CSS property to sync up JS and CSS animations
  ```ts
  const odo = new LightOdometer({ ..., duration: 5000 })
  console.log(getComputedStyle(odo.el).getPropertyValue("--odometer-duration")) // "5000ms"
  ```
- Get and mutate instance and global options
  ```ts
  const odo = new LightOdometer({ ... })
  console.log(odo.getOptions().duration)
  odo.setOptions({ duration: 2000 })
  
  console.log(LightOdometer.getGlobalOptions.selector)
  LightOdometer.setGlobalOptions({ selector: ".my-odometer" })
  ```
- Add per-instance subscriptable animation start/end events. They give back the instance id, el, instance, value, oldValue, options
  ```ts
  const odo = new LightOdometer({ ... })
  console.log(odo.isAnimating)
  
  function onStart(e: Event) {
    const { detail } = e as CustomEvent<LightOdometerEventDetail>
    // detail.id, detail.value, detail.instance.isAnimating, ...
    console.log(`started animating to ${detail.value}`)
  }
  
  function onDone(e: Event) {
    const { detail } = e as CustomEvent<LightOdometerEventDetail>
    console.log(`finished animating to ${detail.value}`)
  }

  odo.on("odometerstart", onStart)
  odo.on("odometerdone", onDone)

  // later
  odo.off("odometerstart", onStart)
  odo.off("odometerdone", onDone)
  ```
- Print the instance in a JSON-friendly string
  ```ts
  const odo = new LightOdometer({ ... })
  console.log(odo.toString()) // {"id":2,"value":157,"options":{"id":2,"value":0,"animation":"slide","duration":8000,"format":"( ddd)","framerate":20},"globalOptions":{},"watchMutations":false,"transitionEndBound":true,"destroyed":false,"format":{"repeating":" ","precision":0},"isAnimating":false}
  ```
