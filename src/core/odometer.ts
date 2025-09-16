import type {
  FormatObject,
  LightOdometerOptions,
  LightOdometerGlobalOptions,
  LightOdometerEventName,
} from "../shared/interfaces"

import {
  DIGIT_HTML, FORMAT_MARK_HTML,
} from "../shared/templates"

import {
  DIGIT_FORMAT,
  FORMAT_PARSER,
  DURATION,
  FRAMES_PER_VALUE,
  DIGIT_SPEEDBOOST,
  FRAMERATE,
  COUNT_FRAMERATE,
} from "../shared/settings"

import {
  createFromHTML,
  removeClass,
  addClass,
  trigger,
  now,
  round,
  truncate,
  initGlobalOptionsDeferred,
  initExistingOdometers,
  isBrowser,
  safeRaf,
  safeCancelRaf,
} from "../utils/utilities"

class LightOdometer {
  static options: LightOdometerGlobalOptions = (typeof window !== "undefined"
    ? (window.odometerOptions ?? {})
    : {})

  private _isAnimating: boolean = false
  options: LightOdometerOptions
  el: HTMLElement
  value: number = 0
  inside!: HTMLElement
  observer?: MutationObserver
  watchMutations: boolean = false
  transitionEndBound: boolean = false
  destroyed: boolean = false
  format: FormatObject = {
    repeating: "", precision: 0,
  }

  /** Readonly flag indicating whether this instance is currently animating */
  get isAnimating(): Readonly<boolean> {
    return this._isAnimating
  }

  MAX_VALUES!: number
  digits: HTMLElement[] = []
  ribbons: Record<number, HTMLElement> = {}
  private _rafId?: number | NodeJS.Timeout
  private _countRafId?: number | NodeJS.Timeout
  private _msPerFrame!: number
  private _countMsPerFrame!: number
  private _onTransitionEnd?: (ev: TransitionEvent)=> void

  /**
   * Initializes a new instance of the LightOdometer class.
   * Sets up the odometer's options, formats, and DOM structure.
   * If an odometer instance already exists on the element, it returns the existing instance.
   * @param {LightOdometerOptions} options - Configuration options for the odometer.
   */
  constructor(options: LightOdometerOptions) {
    this.options = options
    this.el = this.options.el

    // If an instance already exists on this element, reconfigure it with the new options
    if (this.el.odometer) {
      const inst = this.el.odometer

      // Merge options (new options override existing)
      inst.options = {
        ...inst.options,
        ...this.options,
      }

      // Ensure derived timing fields are recomputed
      inst.options.duration ??= DURATION
      const frameRate = inst.options.framerate ?? FRAMERATE
      const countFrameRate = inst.options.countFramerate ?? COUNT_FRAMERATE

      inst._msPerFrame = 1000 / frameRate
      inst._countMsPerFrame = 1000 / countFrameRate
      inst.MAX_VALUES = (inst.options.duration / inst._msPerFrame / FRAMES_PER_VALUE) | 0

      // Refresh format and re-render or update to apply changes
      inst.resetFormat()

      if (this.options.value != null) {
        inst.update(this.options.value)
      } else if (isBrowser()) {
        inst.render()
      }

      return inst
    }

    this.el.odometer = this

    this.options = {
      ...LightOdometer.options,
      ...this.options,
    }

    this.options.duration ??= DURATION
  // Allow per-instance framerate customization
    const frameRate = this.options.framerate ?? FRAMERATE
    const countFrameRate = this.options.countFramerate ?? COUNT_FRAMERATE

    this._msPerFrame = 1000 / frameRate
    this._countMsPerFrame = 1000 / countFrameRate
    this.MAX_VALUES = (this.options.duration / this._msPerFrame / FRAMES_PER_VALUE) | 0

    this.resetFormat()

    this.value = this.cleanValue(this.options.value ?? "")

    // SSR-guard: if not in browser, just no-op render
    if (isBrowser()) {
      this.renderInside()
      this.render()
    }

    try {
      const WRAPPED_PROPS = [ "innerHTML", "innerText", "textContent" ] as const

      for (const property of WRAPPED_PROPS) {
        Object.defineProperty(this.el, property, {
          "get": (): string => {
            if (property === "innerHTML") {
              return this.inside?.outerHTML ?? ""
            } else {
              // It's just a single HTML element, so innerText is the same as outerText.
              return this.inside?.innerText ?? this.inside?.textContent ?? ""
            }
          },
          "set": (val: string) => {
            return this.update(val)
          },
        })
      }
    } catch (_e) {
      // Safari
      if (isBrowser()) {
        this.watchForMutations()
      }
    }
  }

  /**
   * Renders the inner container of the odometer.
   * Clears the root element (`this.el`) and appends a new child element with the class `odometer-inside`.
   * @returns {void}
   */
  renderInside(): void {
    if (!isBrowser()) {
      return
    }

    this.inside = document.createElement("div")
    this.inside.className = "odometer-inside"
    this.el.textContent = ""
    this.el.appendChild(this.inside)
  }

  /**
   * Observes changes to the root element's content and updates the odometer accordingly.
   * This is a fallback for environments like Safari where `.innerHTML` cannot be wrapped.
   * @returns {void}
   */
  watchForMutations(): void {
    try {
      this.observer ??= new MutationObserver((_mutations) => {
        const newVal = this.el.innerText || ""

        this.renderInside()
        this.render(this.value)
        this.update(newVal)
      })

      this.watchMutations = true
      this.startWatchingMutations()
    } catch (_e) {
      // ? nothing
    }
  }

  /**
   * Starts observing mutations on the root element (`this.el`).
   * Listens for changes to the element's child nodes (e.g., additions or removals).
   * Requires `this.watchMutations` to be `true` and a `MutationObserver` to be initialized.
   * @returns {void}
   */
  startWatchingMutations(): void {
    if (this.watchMutations && isBrowser()) {
      this.observer?.observe(this.el, { childList: true })
    }
  }

  /**
   * Stops observing mutations on the root element (`this.el`).
   * Disconnects the `MutationObserver` if it is initialized.
   * @returns {void}
   */
  stopWatchingMutations(): void {
    this.observer?.disconnect()
  }

  /**
   * Cleans and normalizes a value to ensure it can be processed as a number.
   * Converts formatted strings into numeric values by handling radix symbols and removing unnecessary characters.
   * @param {string | number} val - The value to clean and normalize.
   * @returns {number} The cleaned and rounded numeric value.
   */
  cleanValue(val: string | number): number {
    if (typeof val === "string") {
      // We need to normalize the format so we can properly turn it into a float.
      val = val.replace(this.format.radix ?? ".", "<radix>")
      val = val.replace(/[.,\s\u00A0\u202F]/g, "")
      val = val.replace("<radix>", ".")
      val = parseFloat(val) || 0
    }

    return round(val, this.format.precision)
  }

  /**
   * Binds transition end events to the root element (`this.el`).
   * Ensures that the odometer re-renders only once per transition, even if multiple transition end events are triggered. After rendering, it dispatches the `odometerdone` custom event.
   * @returns {void}
   */
  bindTransitionEnd(): void {
    if (this.transitionEndBound) {
      return
    }

    this.transitionEndBound = true

    // The event will be triggered once for each ribbon, we only want one render though
    let renderEnqueued = false

    this._onTransitionEnd = () => {
      if (renderEnqueued) {
        return true
      }

      renderEnqueued = true

      setTimeout(() => {
        this.render()
        renderEnqueued = false
        this._isAnimating = false
        trigger(this.el, "odometerdone", {
          id: this.options.id,
          el: this.el,
          instance: this,
          value: this.value,
          options: this.getOptions(),
        })
      }, 0)

      return true
    }

    this.el.addEventListener("transitionend", this._onTransitionEnd, false)
  }

  /**
   * Resets and parses the odometer's format configuration.
   * Extracts the repeating pattern, radix symbol, and precision from the format string.
   * Throws an error if the format string is invalid or unparsable.
   * @returns {void}
   */
  resetFormat(): void {
    let format = this.options.format ?? DIGIT_FORMAT

    format = format || "d"

    const parsed = FORMAT_PARSER.exec(format)

    if (!parsed) {
      throw new Error("LightOdometer: Unparsable digit format")
    }

    const [ _, repeating, radix, fractional ] = parsed

    const precision = fractional?.length || 0

    this.format = {
      repeating, radix, precision,
    }
  }

  /**
   * Renders the odometer with the specified value.
   * Updates the DOM structure, applies the appropriate classes, and formats the digits for display.
   * @param {number} [value] - The value to render. Defaults to the current value (`this.value`).
   * @returns {void}
   */
  render(value?: number): void {
    if (!isBrowser()) {
      return
    }

    value ??= this.value
    this.stopWatchingMutations()
    this.resetFormat()

    this.inside.textContent = ""

    // Strip previous odometer classes only
    for (const cls of Array.from(this.el.classList)) {
      if ((/^odometer(-|$)/).test(cls)) {
        this.el.classList.remove(cls)
      }
    }

    this.el.classList.add("odometer", "odometer-auto-theme")
    // Expose duration to CSS via custom property for consistent JS/CSS timing
    this.el.style.setProperty("--odometer-duration", `${this.options.duration ?? DURATION}ms`)

    this.ribbons = {}

    this.formatDigits(value)

    this.startWatchingMutations()
  }

  /**
   * Formats the given value into individual digits and renders them.
   * If a custom format function is provided, it uses that to format the value.
   * Otherwise, it preserves the precision and formats the value based on the odometer's configuration.
   * @param {number} value - The value to format and render as digits.
   * @returns {void}
   */
  formatDigits(value: number): void {
    this.digits = []

    if (this.options.formatFunction) {
      const valueString = this.options.formatFunction(value)

      for (const valueDigit of valueString.split("")
        .toReversed()) {
        if ((/\d/).test(valueDigit)) {
          const digit = this.renderDigit()

          const valEl = digit.querySelector<HTMLElement>(".odometer-value")!
          valEl.textContent = valueDigit
          // In static (non-animated) render, mark as both first and last for CSS hooks
          addClass(valEl, "odometer-first-value odometer-last-value")
          this.digits.push(digit)
          this.insertDigit(digit)
        } else {
          this.addSpacer(valueDigit)
        }
      }
    } else {
      const valueString = this.preservePrecision(value)
      let wholePart = !this.format.precision

      for (const digit of valueString.split("")
        .toReversed()) {
        if (digit === ".") {
          wholePart = true
        }

        this.addDigit(digit, wholePart)
      }
    }
  }

  /**
   * Ensures the value maintains the specified precision by adding trailing zeros if necessary.
   * This is used to keep the decimal places consistent at the end of the animation.
   * @param {number} value - The numeric value to format with preserved precision.
   * @returns {string} The value as a string with the required precision.
   */
  preservePrecision(value: number): string {
    // This function fixes the precision at the end of the animation keeping the decimal places even if we have 0 digits only
    let fixedValue: string = value.toString()

    if (this.format.precision) {
      const parts = fixedValue.split(".")

      if (parts.length === 1) {
        fixedValue += "."
        parts[1] = ""
      }

      for (let i = 0; i < this.format.precision; i++) {
        if (!parts[1][i]) {
          fixedValue += "0"
        }
      }
    }

    return fixedValue
  }

  /**
   * Updates the odometer to display a new value.
   * Cleans and normalizes the input value, determines the difference from the current value, and triggers the appropriate animations and DOM updates.
   * @param {string | number} newValue - The new value to update the odometer to.
   * @returns {number} The updated value of the odometer.
   */
  update(newValue: string | number): number {
    if (!isBrowser()) {
      this.value = this.cleanValue(newValue)

      return this.value
    }

    newValue = this.cleanValue(newValue)

    // If the value is the same, we don't need to do anything
    const diff = newValue - this.value

    if (!diff) {
      return this.value
    }

    removeClass(
      this.el,
      "odometer-animating-up odometer-animating-down odometer-animating",
    )

    if (diff > 0) {
      addClass(this.el, "odometer-animating-up")
    } else {
      addClass(this.el, "odometer-animating-down")
    }

    // mark animating and dispatch start event
    this._isAnimating = true
    trigger(this.el, "odometerstart", {
      id: this.options.id,
      el: this.el,
      instance: this,
      value: newValue,
      oldValue: this.value,
      options: this.getOptions(),
    })

    this.stopWatchingMutations()
    this.animate(newValue)
    this.startWatchingMutations()

    setTimeout(() => {
      // Force a repaint using a tiny read, batched
      void this.el.offsetHeight
      addClass(this.el, "odometer-animating")
    }, 0)

    this.value = newValue

    return this.value
  }

  /**
   * Creates and returns a new digit element for the odometer.
   * The digit element is generated from the predefined `DIGIT_HTML` template.
   * @returns {HTMLElement} The newly created digit element.
   */
  renderDigit(): HTMLElement {
    return createFromHTML(DIGIT_HTML)
  }

  /**
   * Inserts a digit element into the odometer's inner container.
   * If a reference element (`before`) is provided, the digit is inserted before it.
   * Otherwise, the digit is appended to the container or inserted at the beginning if other children exist.
   * @param {HTMLElement} digit - The digit element to insert.
   * @param {HTMLElement | null} [before] - The reference element to insert the digit before. Defaults to `null`.
   * @returns {HTMLElement} The inserted digit element.
   */
  insertDigit(digit: HTMLElement, before?: HTMLElement | null): HTMLElement {
    if (before) {
      return this.inside.insertBefore(digit, before)
    } else if (!this.inside.children.length) {
      return this.inside.appendChild(digit)
    } else {
      return this.inside.insertBefore(digit, this.inside.children[0])
    }
  }

  /**
   * Creates and inserts a spacer element into the odometer's inner container.
   * A spacer is a non-digit element (e.g., a comma or decimal point) used for formatting.
   * @param {string} chr - The character to display in the spacer.
   * @param {HTMLElement | null} [before] - The reference element to insert the spacer before. Defaults to `null`.
   * @param {string} [extraClasses] - Additional CSS classes to apply to the spacer element.
   * @returns {HTMLElement} The inserted spacer element.
   */
  addSpacer(
    chr: string,
    before?: HTMLElement | null,
    extraClasses?: string,
  ): HTMLElement {
    const spacer = createFromHTML(FORMAT_MARK_HTML)

    spacer.textContent = chr

    if (extraClasses) {
      addClass(spacer, extraClasses)
    }

    return this.insertDigit(spacer, before)
  }

  /**
   * Adds a digit or spacer element to the odometer's inner container.
   * Handles special cases for negation (`-`) and radix (`.`) characters, and ensures the format's repeating pattern is respected.
   * @param {string} value - The digit or character to add.
   * @param {boolean} [repeating=true] - Whether to use the repeating format pattern. Defaults to `true`.
   * @returns {HTMLElement} The inserted digit or spacer element.
   * @throws {Error} If the format string is invalid or lacks digits.
   */
  addDigit(value: string, repeating?: boolean): HTMLElement {
    repeating ??= true

    if (value === "-") {
      return this.addSpacer(value, null, "odometer-negation-mark")
    }

    if (value === ".") {
      return this.addSpacer(
        this.format.radix ?? ".",
        null,
        "odometer-radix-mark",
      )
    }

    if (repeating) {
      let resetted = false

      while (true) {
        if (!this.format.repeating.length) {
          if (resetted) {
            throw new Error("Bad odometer format without digits")
          }

          this.resetFormat()
          resetted = true
        }

        const chr = this.format.repeating[this.format.repeating.length - 1]

        this.format.repeating = this.format.repeating.substring(
          0,
          this.format.repeating.length - 1,
        )

        if (chr === "d") {
          break
        }

        this.addSpacer(chr)
      }
    }

    const digit = this.renderDigit()

  const valEl = digit.querySelector<HTMLElement>(".odometer-value")!

    valEl.textContent = value
  // In static (non-animated) state, ensure value element has both markers
  addClass(valEl, "odometer-first-value odometer-last-value")
    this.digits.push(digit)

    return this.insertDigit(digit)
  }

  /**
   * Animates the odometer to transition to a new value.
   * Chooses the appropriate animation method (`count` or `slide`) based on the configuration and browser support.
   * @param {number} newValue - The new value to animate the odometer to.
   * @returns {void}
   */
  animate(newValue: number): void {
    if (this.options.animation === "count") {
      this.animateCount(newValue)
    } else {
      this.animateSlide(newValue)
    }
  }

  /**
   * Animates the odometer by incrementing or decrementing the value over time.
   * Uses a "counting" animation to transition smoothly to the new value.
   * @param {number} newValue - The new value to animate the odometer to.
   * @returns {void}
   */
  animateCount(newValue: number): void {
    if (!isBrowser()) {
      return
    }

    // If the value is the same, we don't need to do anything
    const diff = newValue - this.value

    if (!diff) {
      return
    }

    const start = now()
    let last = start

    let cur = this.value
    const tick = () => {
      if (now() - start > (this.options.duration || 0)) {
        this.value = newValue
        this.render()
        this._isAnimating = false
        trigger(this.el, "odometerdone", {
          id: this.options.id,
          el: this.el,
          instance: this,
          value: this.value,
          options: this.getOptions(),
        })

        return
      }

      const delta = now() - last

      if (delta > this._countMsPerFrame) {
        last = now()

        const fraction = delta / (this.options.duration || 0)
        const dist = diff * fraction

        cur += dist
        this.render(Math.round(cur))
      }

      this._countRafId = safeRaf(tick)
    }

    this._countRafId = safeRaf(tick)
  }

  /**
   * Calculates the number of digits in the largest absolute value from the provided numbers.
   * @param {...number} values - A list of numbers to evaluate.
   * @returns {number} The number of digits in the largest absolute value.
   */
  getDigitCount(...values: number[]): number {
    for (let i = 0; i < values.length; i++) {
      values[i] = Math.abs(values[i])
    }

    const max = Math.max(...values)

    return Math.ceil(Math.log(max + 1) / Math.log(10))
  }

  /**
   * Calculates the maximum number of fractional digits (decimal places) among the provided numbers.
   * Assumes the values have already been rounded to the specified precision.
   * @param {...number} values - A list of numbers to evaluate.
   * @returns {number} The maximum number of fractional digits.
   */
  getFractionalDigitCount(...values: number[]): number {
    // This assumes the value has already been rounded to @format.precision places
    const parser = /^-?\d*\.(\d*?)0*$/

    for (let i = 0; i < values.length; i++) {
      const valueStr = values[i].toString()
      const parts = parser.exec(valueStr)

      values[i] = parts
        ? parts[1].length
        : 0
    }

    return Math.max(...values)
  }

  /**
   * Resets the odometer's digits and ribbons.
   * Clears the inner container, resets the format configuration, and prepares the odometer for re-rendering.
   * @returns {void}
   */
  resetDigits(): void {
    this.digits = []
    this.ribbons = {}
    this.inside.textContent = ""
    this.resetFormat()
  }

  /**
   * Creates an array of numbers between two values
   * @param start The starting value of the range
   * @param end The ending value of the range
   * @param inclusive Whether to include the end value in the range
   * @returns An array containing the range of numbers
   */
  createRange(start: number, end: number, inclusive: boolean): number[] {
    const isAscending = start < end
    const length = Math.abs(end - start) + (inclusive
      ? 1
      : 0)

    return Array.from({ length }, (_, i) => (isAscending
      ? start + i
      : start - i))
  }

  /**
   * Animates the odometer to transition to a new value using a sliding animation.
   * Breaks the value into individual digits, calculates the frames for each digit's animation, and updates the DOM to reflect the sliding effect.
   * @param {number} newValue - The new value to animate the odometer to.
   * @returns {void}
   */
  animateSlide(newValue: number): void {
    if (!isBrowser()) {
      return
    }

    let oldValue = this.value

    // Fix to animate always the fixed decimal digits passed in input
    const fractionalCount = this.format.precision

    if (fractionalCount) {
      newValue = newValue * Math.pow(10, fractionalCount)
      oldValue = oldValue * Math.pow(10, fractionalCount)
    }

    // If the value is the same, we don't need to do anything
    const diff = newValue - oldValue

    if (!diff) {
      return
    }

    this.bindTransitionEnd()

    const digits: number[][] = []
    const digitCount = this.getDigitCount(oldValue, newValue)
    let boosted = 0
    let start = oldValue

    // We create an array to represent the series of digits which should be animated in each column
    for (let i = 0; i < digitCount; i++) {
      // We need to get the digit at the current position
      start = truncate(oldValue / Math.pow(10, digitCount - i - 1))
      const end = truncate(newValue / Math.pow(10, digitCount - i - 1))

      const dist = end - start

      let frames: number[]

      if (Math.abs(dist) > this.MAX_VALUES) {
        // We need to subsample
        frames = []

        // Subsequent digits need to be faster than previous ones
        const denominator = this.MAX_VALUES * (1 + (boosted * DIGIT_SPEEDBOOST))
        const incr = dist / denominator
        let cur = start

        while ((dist > 0 && cur < end) || (dist < 0 && cur > end)) {
          frames.push(Math.round(cur))
          cur += incr
        }

        if (frames[frames.length - 1] !== end) {
          frames.push(end)
        }

        boosted++
      } else {
        frames = this.createRange(start, end, true)
      }

      // We only care about the last digit
      for (let j = 0; j < frames.length; j++) {
        frames[j] = Math.abs(frames[j] % 10)
      }

      digits.push(frames)
    }

    this.resetDigits()

    const reversedDigits = digits.toReversed()

    for (let i = 0; i < reversedDigits.length; i++) {
      let frames = reversedDigits[i]

      if (!this.digits[i]) {
        this.addDigit(" ", i >= fractionalCount)
      }

      if (this.ribbons[i] === undefined) {
        const ribbon = this.digits[i].querySelector<HTMLElement>(".odometer-ribbon-inner")

        if (ribbon) {
          this.ribbons[i] = ribbon
        }
      }

      this.ribbons[i].textContent = ""

      if (diff < 0) {
        frames = frames.toReversed()
      }

      for (let j = 0; j < frames.length; j++) {
        const frame = frames[j]
        const numEl = document.createElement("div")

        numEl.className = "odometer-value"
        numEl.textContent = frame.toString()

        this.ribbons[i].appendChild(numEl)

        if (j === frames.length - 1) {
          addClass(numEl, "odometer-last-value")
        }

        if (j === 0) {
          addClass(numEl, "odometer-first-value")
        }
      }
    }

    if (start < 0) {
      this.addDigit("-")
    }

    const mark = this.inside.querySelector(".odometer-radix-mark")

    if (mark) {
      mark.parentNode!.removeChild(mark)
    }

    if (fractionalCount) {
      this.addSpacer(
        this.format.radix ?? ".",
        this.digits[fractionalCount - 1],
        "odometer-radix-mark",
      )
    }
  }

  /**
   * Initializes all odometer elements on the page.
   * Selects elements matching the configured selector or the default `.odometer` class, and creates a `LightOdometer` instance for each element.
   * @returns {LightOdometer[]} An array of initialized `LightOdometer` instances.
   */
  static init(): LightOdometer[] {
    if (!isBrowser()) {
      return []
    }

    const elements = document.querySelectorAll<HTMLElement>(LightOdometer.options.selector || ".odometer")

    return Array.from(
      elements,
      (el) => (el.odometer = new LightOdometer({
        el,
        value: el.innerText ?? el.textContent,
      })),
    )
  }

  /**
   * Mutate this instance's options on-the-fly.
   * Recomputes timing fields and applies changes immediately.
   * If a new value is provided, it triggers update() with the new configuration.
   */
  setOptions(newOptions: Partial<LightOdometerOptions>): void {
    if (!newOptions || typeof newOptions !== "object") {
      return
    }

    // Ignore attempts to swap the bound element at runtime
    if ("el" in newOptions) {
      delete (newOptions as Partial<LightOdometerOptions> & { el?: HTMLElement }).el
    }

    const hasValueChange = Object.prototype.hasOwnProperty.call(newOptions, "value")
    const hadFormatChange = Object.prototype.hasOwnProperty.call(newOptions, "format")
      || Object.prototype.hasOwnProperty.call(newOptions, "formatFunction")
    const hadTimingChange = Object.prototype.hasOwnProperty.call(newOptions, "duration")
      || Object.prototype.hasOwnProperty.call(newOptions, "framerate")
      || Object.prototype.hasOwnProperty.call(newOptions, "countFramerate")

    // Merge and recompute derived timing
    this.options = {
      ...this.options, ...newOptions,
    }
    this.options.duration ??= DURATION

    const frameRate = this.options.framerate ?? FRAMERATE
    const countFrameRate = this.options.countFramerate ?? COUNT_FRAMERATE

    this._msPerFrame = 1000 / frameRate
    this._countMsPerFrame = 1000 / countFrameRate
    this.MAX_VALUES = (this.options.duration / this._msPerFrame / FRAMES_PER_VALUE) | 0

    // Update CSS custom property for duration
    if (isBrowser()) {
      this.el.style.setProperty("--odometer-duration", `${this.options.duration}ms`)
    }

    // Apply format changes
    if (hadFormatChange) {
      this.resetFormat()
    }

    // If a value change was requested, animate/update to that value using the new config
    if (hasValueChange) {
      this.update(this.options.value ?? 0)

      return
    }

    // Otherwise, re-render to apply format/timing-related structural changes
    if (hadFormatChange || hadTimingChange) {
      if (isBrowser()) {
        this.stopWatchingMutations()
        this.render()
        this.startWatchingMutations()
      }
    }
  }

  /**
   * Update global default options at runtime. Does not retroactively affect existing instances.
   */
  static setGlobalOptions(newOptions: Partial<LightOdometerGlobalOptions>): void {
    LightOdometer.options = {
      ...LightOdometer.options,
      ...newOptions,
    }
  }

  /** Subscribe to odometer events ("odometerstart" | "odometerdone") for this instance */
  on(event: LightOdometerEventName, handler: EventListener): void {
    this.el.addEventListener(event, handler)
  }

  /** Unsubscribe from odometer events for this instance */
  off(event: LightOdometerEventName, handler: EventListener): void {
    this.el.removeEventListener(event, handler)
  }

  /**
   * Get a shallow copy snapshot of this instance's current options.
   * Mutating the returned object will not affect the instance.
   */
  getOptions(): Readonly<LightOdometerOptions> {
    return { ...this.options }
  }

  /**
   * Get a shallow copy snapshot of global default options.
   */
  static getGlobalOptions(): Readonly<LightOdometerGlobalOptions> {
    return { ...LightOdometer.options }
  }

  /**
   * Animate to a value exactly once and then disconnect listeners/observers.
   * Useful for static numbers that only animate on first reveal.
   */
  animateOnceAndDisconnect(toValue?: number | string): void {
    if (toValue != null) {
      this.update(toValue)
    }

    // After current transition end or in next frame, disconnect
    const finish = () => this.disconnect()
    const once = (_e: Event) => {
      this.el.removeEventListener("odometerdone", once)
      finish()
    }

    this.el.addEventListener("odometerdone", once, { once: true })
    // Fallback in case transitionend/odometerdone doesn't fire
    setTimeout(finish, (this.options.duration ?? DURATION) + 100)
  }

  /**
   * Disconnect all observers and cancel animation frames. Remove transition listener flag.
   */
  disconnect(): void {
    if (this.destroyed) {
      return
    }

    this.stopWatchingMutations()
    safeCancelRaf(this._rafId)
    safeCancelRaf(this._countRafId)

    if (this._onTransitionEnd) {
      this.el.removeEventListener("transitionend", this._onTransitionEnd)
      this._onTransitionEnd = undefined
    }

    this.transitionEndBound = false
    this.destroyed = true
  }

  /**
   * Returns the entire current odometer object along with the global options.
   * @returns {string} A string representation of the current odometer state.
   */
  toString(): string {
    // Avoid serializing the HTMLElement directly (circular / large). Use an HTML snapshot instead.
    const elSnapshot = (this.el && typeof (this.el).outerHTML === "string")
      ? (this.el).outerHTML
      : (() => {
        try {
          return JSON.stringify(this.el)
        } catch {
          // oxlint-disable-next-line no-base-to-string
          return String(this.el)
        }
      })()

    const snapshot = {
      el: elSnapshot,
      id: this.options.id,
      value: this.value,
      options: this.getOptions(),
      globalOptions: LightOdometer.getGlobalOptions(),
    }

    return JSON.stringify(snapshot)
  }
}

// Initialize LightOdometer global options with a deferred execution
initGlobalOptionsDeferred(LightOdometer)

// Initialize all existing LightOdometer instances on the page when the DOM is fully loaded
initExistingOdometers(LightOdometer)

export default LightOdometer
