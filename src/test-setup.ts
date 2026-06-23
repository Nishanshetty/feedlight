import "@testing-library/jest-dom";

// jsdom does not implement scrollTo / scrollIntoView – stub them out so
// components that call these methods don't throw in tests.
Element.prototype.scrollTo = () => {};
Element.prototype.scrollIntoView = () => {};
window.scrollTo = () => {};

// jsdom does not implement Web Speech API.
Object.defineProperty(window, "speechSynthesis", {
  value: {
    cancel: () => {},
    speak: () => {},
    pause: () => {},
    resume: () => {},
    getVoices: () => [],
    pending: false,
    speaking: false,
    paused: false,
  },
  writable: true,
});

// jsdom does not implement cancelAnimationFrame / requestAnimationFrame
// (it does provide stubs, but make them no-ops to be safe).
window.cancelAnimationFrame = () => {};
window.requestAnimationFrame = (cb) => { setTimeout(cb, 0); return 0; };