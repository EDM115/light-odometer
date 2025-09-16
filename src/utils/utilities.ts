import type LightOdometer from "../core/odometer"
import type { LightOdometerEventDetail } from "../shared/interfaces"

/**
 * Creates an HTML element from the given HTML string.
 * Assumes the HTML string contains a single root element.
 * @param {string} html - The HTML string to convert to an element.
 * @returns {HTMLElement} The first child element created from the HTML string.
 * @throws {Error} If the HTML string is empty or does not contain a valid element.
 */
function createFromHTML(html: string): HTMLElement {
  const el = document.createElement("div")

  el.innerHTML = html

  if (!(el.firstElementChild instanceof HTMLElement)) {
    throw new Error("Invalid HTML: No valid root element found.")
  }

  return el.firstElementChild
}

/**
 * Removes one or more class names from an element.
 * If any of the class names do not exist, they are ignored.
 * @param {HTMLElement} el - The element to remove the class(es) from.
 * @param {string} name - A space-separated string of class names to remove.
 * @returns {string} The updated `className` string of the element (may contain leading/trailing spaces).
 */
function removeClass(el: HTMLElement, name: string): string {
  const names = name.split(" ")

  for (const n of names) {
    el.classList.remove(n)
  }

  return el.className
}

/**
 * Adds one or more class names to an element.
 * If any of the class names already exist, they will not be duplicated.
 * @param {HTMLElement} el - The element to add the class(es) to.
 * @param {string} name - A space-separated string of class names to add.
 * @returns {string} The updated `className` string of the element (may contain leading/trailing spaces).
 */
function addClass(el: HTMLElement, name: string): string {
  const names = name.split(" ")

  for (const n of names) {
    if (n) {
      el.classList.add(n)
    }
  }

  return el.className
}

/**
 * Triggers a custom DOM event on the specified element.
 * @param {HTMLElement} el - The element on which to dispatch the event.
 * @param {string} name - The name of the event to trigger.
 */
function trigger(el: HTMLElement, name: string, detail?: LightOdometerEventDetail): void {
  const evt = new CustomEvent(name, {
    bubbles: true, cancelable: true, detail,
  })

  el.dispatchEvent(evt)
}

/**
 * Returns the current timestamp in milliseconds.
 * Uses `window.performance.now()` if available for higher precision,
 * falling back to `Date.now()` if not.
 * @returns {number} The current timestamp in milliseconds.
 */
function now(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now()
  }

  return Date.now()
}

/**
 * Rounds a number to the specified precision.
 * If no precision is provided, the number is rounded to the nearest integer.
 * @param {number} val - The number to round.
 * @param {number} [precision=0] - The number of decimal places to round to. Defaults to 0.
 * @returns {number} The rounded number.
 */
function round(val: number, precision?: number): number {
  precision ??= 0

  if (!precision) {
    return Math.round(val)
  }

  val *= Math.pow(10, precision)
  val += 0.5
  val = Math.floor(val)

  return (val /= Math.pow(10, precision))
}

/**
 * Truncates a number by removing its fractional part.
 * For positive numbers, it behaves like `Math.floor`.
 * For negative numbers, it behaves like `Math.ceil`.
 * @param {number} val - The number to truncate.
 * @returns {number} The truncated number.
 */
function truncate(val: number): number {
  // | 0 fails on numbers greater than 2^32
  if (val < 0) {
    return Math.ceil(val)
  } else {
    return Math.floor(val)
  }
}

/**
 * Calculates the fractional part of a number.
 * The fractional part is the difference between the number and its rounded value.
 * @param {number} val - The number to extract the fractional part from.
 * @returns {number} The fractional part of the number.
 */
function fractionalPart(val: number): number {
  return val - round(val)
}

/** SSR guard */
function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined"
}

/** Safe requestAnimationFrame fallback */
function safeRaf(cb: FrameRequestCallback): number | NodeJS.Timeout {
  if (isBrowser() && typeof requestAnimationFrame === "function") {
    return requestAnimationFrame(cb)
  }

  // 60fps-ish fallback in non-browser
  return setTimeout(() => cb(now()), 16)
}

/** Safe cancel for requestAnimationFrame fallback */
function safeCancelRaf(id: number | NodeJS.Timeout | null | undefined): void {
  if (id == null) {
    return
  }

  if (isBrowser() && typeof cancelAnimationFrame === "function" && typeof id === "number") {
    cancelAnimationFrame(id)
  } else {
    clearTimeout(id)
  }
}

/** Document ready helper */
function onDocumentReady(cb: ()=> void): void {
  if (!isBrowser()) {
    return
  }

  if (document.readyState === "complete" || document.readyState === "interactive") {
    // Queue to end of task to mimic DOMContentLoaded order
    setTimeout(cb, 0)
  } else {
    document.addEventListener("DOMContentLoaded", cb, { once: true })
  }
}

/**
 * Initializes global options for the provided `LightOdometer` class with a deferred execution.
 * Sets the static `options` object of the `LightOdometer` class based on `window.odometerOptions`.
 * This allows users to configure `window.odometerOptions` after the script has been loaded.
 * The function re-checks `window.odometerOptions` after a short timeout to apply any late configurations.
 * @param {typeof LightOdometer} LightOdometerClass - The `LightOdometer` class to initialize options for.
 * @returns {void}
 */
function initGlobalOptionsDeferred(LightOdometerClass: typeof LightOdometer): void {
  if (!isBrowser()) {
    return
  }

  setTimeout(() => {
    // We do this in a separate pass to allow people to set
    // window.odometerOptions after bringing the file in.
    if (window.odometerOptions) {
      LightOdometerClass.options = {
        ...LightOdometerClass.options,
        ...window.odometerOptions,
      }
    }
  }, 0)
}

/**
 * Initializes all existing `LightOdometer` instances on the page when the DOM is fully loaded.
 * Ensures that initialization occurs after the DOM is ready.
 * @param {typeof LightOdometer} LightOdometerClass - The `LightOdometer` class to initialize instances for.
 * @returns {void}
 */
function initExistingOdometers(LightOdometerClass: typeof LightOdometer): void {
  onDocumentReady(() => {
    if (LightOdometerClass.options.auto !== false) {
      LightOdometerClass.init()
    }
  })
}

export {
  createFromHTML,
  removeClass,
  addClass,
  trigger,
  now,
  round,
  truncate,
  fractionalPart,
  isBrowser,
  safeRaf,
  safeCancelRaf,
  onDocumentReady,
  initGlobalOptionsDeferred,
  initExistingOdometers,
}
