import assert from 'node:assert/strict';
import test from 'node:test';
import {
  initPublicationMotion,
  initProjectPointerMotion,
  buildPublicationKeyframes,
} from '../src/scripts/publication-motion.mjs';
import {
  HOME_DESKTOP_MEDIA,
  HOME_PUBLICATION_MEDIA,
  initHomeBreakpointMotion,
  isHomeLayoutSettling,
} from '../src/scripts/home-breakpoint-motion.mjs';

function motionElement(top) {
  const calls = [];
  const element = {
    calls,
    cancellations: 0,
    style: {},
    getBoundingClientRect() {
      return { top };
    },
    animate(keyframes, options) {
      calls.push({ keyframes, options });
      return {
        cancel() {
          element.cancellations += 1;
        },
      };
    },
  };
  return element;
}

function motionEnvironment(elements, { narrow = false, reduced = false } = {}) {
  const observers = [];
  const mediaQueries = [];
  const browserWindow = {
    innerHeight: 600,
    matchMedia(query) {
      mediaQueries.push(query);
      return { matches: query.includes('max-width') ? narrow : reduced };
    },
    IntersectionObserver: class {
      constructor(callback) {
        this.callback = callback;
        this.observed = [];
        this.unobserved = [];
        this.disconnected = false;
        observers.push(this);
      }

      observe(element) {
        this.observed.push(element);
      }

      unobserve(element) {
        this.unobserved.push(element);
      }

      disconnect() {
        this.disconnected = true;
      }
    },
  };
  return {
    browserWindow,
    mediaQueries,
    observers,
    root: { querySelectorAll: () => elements },
  };
}

function wrapperChildEnvironment() {
  const observers = [];
  const publicationMedia = {
    matches: false,
    listeners: [],
    addEventListener(type, listener) { if (type === 'change') this.listeners.push(listener); },
  };
  const desktopMedia = { matches: false, addEventListener() {} };
  const reducedMotion = { matches: false, addEventListener() {} };
  let finishSettle;
  const wrapper = {
    rect: { left: 40, top: 700 },
    getBoundingClientRect() { return this.rect; },
    animate() {
      return { cancel() {}, finished: new Promise((resolve) => { finishSettle = resolve; }) };
    },
  };
  const beat = motionElement(700);
  beat.parentElement = wrapper;
  wrapper.contains = (element) => element === beat;
  const hero = { children: [], getAnimations() { return []; } };
  const root = {
    querySelector(selector) { return selector === '.home-hero' ? hero : null; },
    querySelectorAll(selector) {
      if (selector === '[data-home-layout-project]') return [wrapper];
      if (selector === '[data-motion-beat]') return [beat];
      return [];
    },
  };
  const browserWindow = {
    innerHeight: 600,
    matchMedia(query) {
      if (query === HOME_DESKTOP_MEDIA) return desktopMedia;
      if (query === HOME_PUBLICATION_MEDIA) return publicationMedia;
      return reducedMotion;
    },
    requestAnimationFrame(callback) { callback(); return 1; },
    cancelAnimationFrame() {},
    addEventListener() {},
    IntersectionObserver: class {
      constructor(callback) { this.callback = callback; this.observed = []; observers.push(this); }
      observe(element) { this.observed.push(element); }
      unobserve() {}
      disconnect() {}
    },
  };
  return {
    beat,
    browserWindow,
    finishSettle() { finishSettle(); },
    observers,
    root,
    wrapper,
    startSettle() {
      wrapper.rect = { left: 200, top: 700 };
      publicationMedia.matches = true;
      for (const listener of publicationMedia.listeners) listener();
    },
  };
}

function pointerRow({ left = 100, top = 200, width = 400, height = 200 } = {}) {
  const listeners = new Map();
  const values = new Map();
  return {
    listeners,
    style: {
      setProperty(name, value) { values.set(name, value); },
      getPropertyValue(name) { return values.get(name) ?? ''; },
    },
    addEventListener(type, listener, options) {
      listeners.set(type, { listener, options });
    },
    removeEventListener(type, listener) {
      if (listeners.get(type)?.listener === listener) listeners.delete(type);
    },
    getBoundingClientRect() { return { left, top, width, height }; },
  };
}

function pointerEnvironment(rows, { reduced = false } = {}) {
  return {
    root: {
      querySelectorAll(selector) {
        return selector === '.project-index-row' ? rows : [];
      },
    },
    browserWindow: {
      matchMedia() { return { matches: reduced }; },
    },
  };
}

test('tracks bounded mouse position for each project row', () => {
  const row = pointerRow();
  const { root, browserWindow } = pointerEnvironment([row]);

  initProjectPointerMotion(root, browserWindow);
  const move = row.listeners.get('pointermove');
  move.listener({ pointerType: 'mouse', clientX: 900, clientY: -100 });

  assert.equal(move.options.passive, true);
  assert.equal(row.style.getPropertyValue('--motion-x'), '1');
  assert.equal(row.style.getPropertyValue('--motion-y'), '-1');
  row.listeners.get('pointerleave').listener();
  assert.equal(row.style.getPropertyValue('--motion-x'), '0');
  assert.equal(row.style.getPropertyValue('--motion-y'), '0');
});

test('ignores non-mouse pointers without changing project hover state', () => {
  const row = pointerRow();
  const { root, browserWindow } = pointerEnvironment([row]);

  initProjectPointerMotion(root, browserWindow);
  row.listeners.get('pointermove').listener({ pointerType: 'touch', clientX: 450, clientY: 300 });

  assert.equal(row.style.getPropertyValue('--motion-x'), '');
  assert.equal(row.style.getPropertyValue('--motion-y'), '');
});

test('project pointer cleanup removes every listener', () => {
  const rows = [pointerRow(), pointerRow()];
  const { root, browserWindow } = pointerEnvironment(rows);

  const cleanup = initProjectPointerMotion(root, browserWindow);
  cleanup();

  assert.deepEqual(rows.map((row) => [...row.listeners.keys()]), [[], []]);
});

test('reduced motion does not initialize project pointer tracking', () => {
  const row = pointerRow();
  const { root, browserWindow } = pointerEnvironment([row], { reduced: true });

  const cleanup = initProjectPointerMotion(root, browserWindow);
  cleanup();

  assert.deepEqual([...row.listeners.keys()], []);
});

test('publication motion cleanup removes project pointer listeners', () => {
  const target = motionElement(700);
  const row = pointerRow();
  const { browserWindow, root } = motionEnvironment([target]);
  root.querySelectorAll = (selector) => selector === '.project-index-row' ? [row] : [target];

  const cleanup = initPublicationMotion(root, browserWindow);
  assert.deepEqual([...row.listeners.keys()], ['pointermove', 'pointerleave']);
  cleanup();

  assert.deepEqual([...row.listeners.keys()], []);
});

test('observes only motion beats below the initial viewport', () => {
  const visible = motionElement(120);
  const belowFold = motionElement(700);
  const { browserWindow, observers, root } = motionEnvironment([visible, belowFold]);

  initPublicationMotion(root, browserWindow);

  assert.deepEqual(observers[0].observed, [belowFold]);
  assert.deepEqual(visible.calls, []);
});

test('starts an intersecting target animation before immediately unobserving it', () => {
  const target = motionElement(700);
  const { browserWindow, observers, root } = motionEnvironment([target]);

  initPublicationMotion(root, browserWindow);
  const operations = [];
  target.animate = () => {
    operations.push('animate');
    return { cancel() {} };
  };
  const unobserve = observers[0].unobserve.bind(observers[0]);
  observers[0].unobserve = (element) => {
    operations.push('unobserve');
    unobserve(element);
  };
  observers[0].callback([{ target, isIntersecting: true }]);
  observers[0].callback([{ target, isIntersecting: true }]);

  assert.deepEqual(operations, ['animate', 'unobserve']);
  assert.deepEqual(observers[0].unobserved, [target]);
});

test('leaves a target observed and retryable when its animation cannot start', () => {
  const target = motionElement(700);
  const { browserWindow, observers, root } = motionEnvironment([target]);
  let attempts = 0;
  target.animate = () => {
    attempts += 1;
    if (attempts === 1) throw new Error('animation unavailable');
    return { cancel() {} };
  };

  initPublicationMotion(root, browserWindow);
  assert.doesNotThrow(() => observers[0].callback([{ target, isIntersecting: true }]));
  assert.deepEqual(observers[0].unobserved, []);
  observers[0].callback([{ target, isIntersecting: true }]);

  assert.equal(attempts, 2);
  assert.deepEqual(observers[0].unobserved, [target]);
});

test('defers a nested Story Beat until its active layout-settle wrapper finishes', async () => {
  const environment = wrapperChildEnvironment();
  initHomeBreakpointMotion(environment.root, environment.browserWindow);
  await Promise.resolve();
  await Promise.resolve();
  initPublicationMotion(environment.root, environment.browserWindow);
  environment.startSettle();
  assert.equal(isHomeLayoutSettling(environment.wrapper), true);

  environment.observers[0].callback([{ target: environment.beat, isIntersecting: true }]);
  assert.deepEqual(environment.beat.calls, []);

  environment.finishSettle();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(environment.beat.calls.length, 1);
});

test('does not retain a deferred Story Beat after publication motion cleanup', async () => {
  const environment = wrapperChildEnvironment();
  initHomeBreakpointMotion(environment.root, environment.browserWindow);
  await Promise.resolve();
  await Promise.resolve();
  const cleanup = initPublicationMotion(environment.root, environment.browserWindow);
  environment.startSettle();
  environment.observers[0].callback([{ target: environment.beat, isIntersecting: true }]);
  cleanup();

  environment.finishSettle();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(environment.beat.calls, []);
});

test('builds alternating desktop and vertical narrow-screen entrance keyframes', () => {
  assert.deepEqual(buildPublicationKeyframes(0, false), [
    { opacity: 0, filter: 'blur(2px)', translate: '-34px 0' },
    { opacity: 1, filter: 'blur(0)', translate: '0 0' },
  ]);
  assert.deepEqual(buildPublicationKeyframes(1, false), [
    { opacity: 0, filter: 'blur(2px)', translate: '34px 0' },
    { opacity: 1, filter: 'blur(0)', translate: '0 0' },
  ]);
  assert.deepEqual(buildPublicationKeyframes(0, true), [
    { opacity: 0, filter: 'blur(2px)', translate: '0 34px' },
    { opacity: 1, filter: 'blur(0)', translate: '0 0' },
  ]);
});

test('uses the approved timing and a bounded source-order stagger', () => {
  const first = motionElement(700);
  const later = motionElement(800);
  const { browserWindow, observers, root } = motionEnvironment([first, later]);

  initPublicationMotion(root, browserWindow);
  observers[0].callback([
    { target: first, isIntersecting: true },
    { target: later, isIntersecting: true },
  ]);

  assert.deepEqual(first.calls[0].options, {
    duration: 430,
    easing: 'cubic-bezier(.2, .8, .2, 1)',
    delay: 0,
    fill: 'both',
  });
  assert.equal(later.calls[0].options.delay, 55);
});

test('uses the exact approved narrow-screen media query', () => {
  const target = motionElement(700);
  const { browserWindow, mediaQueries, root } = motionEnvironment([target]);

  initPublicationMotion(root, browserWindow);

  assert.deepEqual(mediaQueries, [
    '(prefers-reduced-motion: reduce)',
    '(max-width: 760px)',
  ]);
});

test('keeps source-order delay when an earlier beat is initially visible', () => {
  const visible = motionElement(120);
  const target = motionElement(700);
  const { browserWindow, observers, root } = motionEnvironment([visible, target]);

  initPublicationMotion(root, browserWindow);
  observers[0].callback([{ target, isIntersecting: true }]);

  assert.equal(target.calls[0].options.delay, 55);
});

test('does nothing when reduced motion is preferred', () => {
  const target = motionElement(700);
  const { browserWindow, observers, root } = motionEnvironment([target], { reduced: true });

  const cleanup = initPublicationMotion(root, browserWindow);

  assert.equal(typeof cleanup, 'function');
  assert.deepEqual(observers, []);
  assert.deepEqual(target.calls, []);
});

test('leaves content untouched when required browser APIs are unavailable', () => {
  const noObserverTarget = motionElement(700);
  const noObserver = motionEnvironment([noObserverTarget]);
  delete noObserver.browserWindow.IntersectionObserver;
  initPublicationMotion(noObserver.root, noObserver.browserWindow);

  const noAnimateTarget = motionElement(700);
  delete noAnimateTarget.animate;
  const noAnimate = motionEnvironment([noAnimateTarget]);
  const noAnimateRow = pointerRow();
  noAnimate.root.querySelectorAll = (selector) => selector === '.project-index-row' ? [noAnimateRow] : [noAnimateTarget];
  initPublicationMotion(noAnimate.root, noAnimate.browserWindow);

  assert.deepEqual(noObserver.observers, []);
  assert.deepEqual(noObserverTarget.style, {});
  assert.deepEqual(noAnimate.observers, []);
  assert.deepEqual(noAnimateTarget.style, {});
  assert.deepEqual([...noAnimateRow.listeners.keys()], []);
});

test('never assigns hidden state before or during an entrance callback', () => {
  const target = motionElement(700);
  const hiddenStateAssignments = [];
  target.style = new Proxy({}, {
    set(style, property, value) {
      hiddenStateAssignments.push(`style.${String(property)}=${value}`);
      style[property] = value;
      return true;
    },
  });
  Object.defineProperty(target, 'className', {
    get() { return undefined; },
    set(value) { hiddenStateAssignments.push(`className=${value}`); },
  });
  const { browserWindow, observers, root } = motionEnvironment([target]);

  initPublicationMotion(root, browserWindow);
  observers[0].callback([{ target, isIntersecting: true }]);

  assert.equal(target.style.opacity, undefined);
  assert.equal(target.className, undefined);
  assert.deepEqual(hiddenStateAssignments, []);
});

test('cleanup disconnects the observer and cancels started animations', () => {
  const target = motionElement(700);
  const { browserWindow, observers, root } = motionEnvironment([target]);

  const cleanup = initPublicationMotion(root, browserWindow);
  observers[0].callback([{ target, isIntersecting: true }]);
  cleanup();

  assert.equal(observers[0].disconnected, true);
  assert.equal(target.cancellations, 1);
});
