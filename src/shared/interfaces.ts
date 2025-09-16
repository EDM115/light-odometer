import type LightOdometer from "../core/odometer"

/**
 * LightOdometer global options interface
 * @property {string} [selector] - The selector for the odometer elements.
 * @property {boolean} [auto] - Whether to automatically initialize odometers.
 */
export interface LightOdometerGlobalOptions {
  selector?: string;
  auto?: boolean;
}

/**
 * LightOdometer config interface
 * @property {HTMLElement} el - The HTML element to attach the odometer to.
 * @property {string | number | null} [value] - The initial value of the odometer.
 * @property {string} [format] - The format string for the odometer.
 * @property {number} [duration] - The duration of the animation in milliseconds.
 * @property {number} [framerate] - Target framerate for slide animation.
 * @property {number} [countFramerate] - Target framerate for count animation.
 * @property {'count' | 'slide'} [animation] - The animation type ('count' or 'slide').
 * @property {(value: number) => string} [formatFunction] - A custom format function.
 */
export interface LightOdometerOptions {
  el: HTMLElement;

  /** Optional identifier for this instance; propagated in event details */
  id?: string | number;
  value?: string | number | null;
  format?: string;
  duration?: number;
  framerate?: number;
  countFramerate?: number;
  animation?: "count" | "slide";
  formatFunction?: (value: number)=> string;
}

export type LightOdometerEventName = "odometerstart" | "odometerdone"

export interface LightOdometerEventDetail {
  id?: string | number;
  el: HTMLElement;
  instance: LightOdometer;

  /** New value driving the animation */
  value: number;

  /** Previous value before the animation (if available) */
  oldValue?: number;

  /** Snapshot of instance options at the time of the event */
  options: LightOdometerOptions;
}

/**
 * FormatObject interface
 * @property {string} repeating - The repeating part of the format. (i.e. '(,ddd)')
 * @property {string} [radix] - The radix separator. (i.e. '.')
 * @property {number} precision - The number of decimal places. (i.e. 'dd')
 */
export interface FormatObject {
  repeating: string;
  radix?: string;
  precision: number;
}

declare global {
  interface Window extends WindowOrWorkerGlobalScope { odometerOptions?: LightOdometerGlobalOptions }

  interface HTMLElement { odometer?: LightOdometer }
}
