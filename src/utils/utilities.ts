import type { LightOdometer } from "../core/odometer"

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
  el.className = el.className.replace(
    new RegExp(`(^| )${name.split(" ")
      .join("|")}( |$)`, "gi"),
    " ",
  )

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
  removeClass(el, name)

  return (el.className += ` ${name}`)
}

/**
 * Triggers a custom DOM event on the specified element.
 * @param {HTMLElement} el - The element on which to dispatch the event.
 * @param {string} name - The name of the event to trigger.
 */
function trigger(el: HTMLElement, name: string): void {
  const evt = new CustomEvent(name, {
    bubbles: true, cancelable: true,
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
  const left = window.performance?.now?.()

  return left ?? +new Date()
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

/**
 * Initializes global options for the provided `LightOdometer` class with a deferred execution.
 * Sets the static `options` object of the `LightOdometer` class based on `window.odometerOptions`.
 * This allows users to configure `window.odometerOptions` after the script has been loaded.
 * The function re-checks `window.odometerOptions` after a short timeout to apply any late configurations.
 * @param {typeof LightOdometer} LightOdometerClass - The `LightOdometer` class to initialize options for.
 * @returns {void}
 */
function initGlobalOptionsDeferred(LightOdometerClass: typeof LightOdometer): void {
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
  document.addEventListener(
    "DOMContentLoaded",
    function () {
      if (LightOdometerClass.options.auto !== false) {
        LightOdometerClass.init()
      }
    },
    false,
  )
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
  initGlobalOptionsDeferred,
  initExistingOdometers,
}
