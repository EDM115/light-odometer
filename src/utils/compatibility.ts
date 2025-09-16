const TRANSITION_END_EVENTS = "transitionend"

const transitionCheckStyles = document.createElement("div").style
const TRANSITION_SUPPORT: boolean = transitionCheckStyles.transition != null

const requestAnimationFrame: typeof window.requestAnimationFrame = window.requestAnimationFrame

const MutationObserver: typeof window.MutationObserver = window.MutationObserver

export {
  TRANSITION_END_EVENTS,
  TRANSITION_SUPPORT,
  requestAnimationFrame,
  MutationObserver,
}
