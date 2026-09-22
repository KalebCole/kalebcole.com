import assert from 'node:assert/strict';
import test from 'node:test';
import {
  HOME_DESKTOP_MEDIA,
  HOME_PUBLICATION_MEDIA,
  animateHomeLayoutShift,
  findViewportAnchor,
  initHomeBreakpointMotion,
} from '../src/scripts/home-breakpoint-motion.mjs';

function elementAt(rect) {
  const calls = [];
  return {
    calls,
    rect,
    getBoundingClientRect() { return this.rect; },
    animate(keyframes, options) {
      calls.push({ keyframes, options });
      return { cancel() {}, finished: Promise.resolve() };
    },
  };
}

function media(matches = false) {
  const listeners = [];
  return {
    matches,
    addEventListener(type, listener) { if (type === 'change') listeners.push(listener); },
    cross(next) {
      this.matches = next;
      for (const listener of listeners) listener();
    },
  };
}

function motionEnvironment({ hero, publication = [], desktop = false, publicationWide = false, reduced = false }) {
  const desktopMedia = media(desktop);
  const publicationMedia = media(publicationWide);
  const reducedMotion = media(reduced);
  const resizeListeners = [];
  const browserWindow = {
    matchMedia(query) {
      if (query === HOME_DESKTOP_MEDIA) return desktopMedia;
      if (query === HOME_PUBLICATION_MEDIA) return publicationMedia;
      return reducedMotion;
    },
    requestAnimationFrame(callback) { callback(); return 1; },
    cancelAnimationFrame() {},
    addEventListener(type, listener) { if (type === 'resize') resizeListeners.push(listener); },
  };
  return {
    browserWindow,
    desktopMedia,
    publicationMedia,
    root: {
      querySelector(selector) { return selector === '.home-hero' ? hero : null; },
      querySelectorAll(selector) { return selector === '[data-home-layout-settle]' ? publication : []; },
    },
    resize() { for (const listener of resizeListeners) listener(); },
  };
}

function scrollingEnvironment({
  hero,
  publication = [],
  reduced = false,
  viewportHeight = 600,
  scrollable = true,
  rejectWindowScroll = false,
}) {
  const environment = motionEnvironment({ hero, publication, reduced });
  const scrollCalls = [];
  environment.browserWindow.innerHeight = viewportHeight;
  const scrollingElement = {
    scrollHeight: scrollable ? viewportHeight * 2 : viewportHeight,
    clientHeight: viewportHeight,
  };
  let scrollTop = 0;
  Object.defineProperty(scrollingElement, 'scrollTop', {
    get() { return scrollTop; },
    set(next) {
      const delta = next - scrollTop;
      scrollTop = next;
      scrollCalls.push([0, delta]);
      for (const element of [...hero.children, ...publication]) element.viewportOffset += delta;
    },
  });
  environment.browserWindow.document = {
    scrollingElement,
  };
  environment.browserWindow.scrollBy = rejectWindowScroll
    ? () => { throw new Error('viewport anchoring must not request browser smooth scrolling'); }
    : (x, y) => {
      scrollCalls.push([x, y]);
      for (const element of [...hero.children, ...publication]) element.viewportOffset += y;
    };
  return { ...environment, scrollCalls };
}

function scrollingElementAt({ left = 0, top = 0 }) {
  const calls = [];
  return {
    calls,
    left,
    top,
    viewportOffset: 0,
    getBoundingClientRect() { return { left: this.left, top: this.top - this.viewportOffset }; },
    animate(keyframes, options) {
      calls.push({ keyframes, options });
      return { cancel() {}, finished: Promise.resolve() };
    },
  };
}

test('uses the exact homepage breakpoint media queries', () => {
  assert.equal(HOME_DESKTOP_MEDIA, '(min-width: 850px)');
  assert.equal(HOME_PUBLICATION_MEDIA, '(min-width: 760px)');
});

test('settles moved elements in DOM order with fully opaque keyframes', () => {
  const greeting = elementAt({ left: 80, top: 120 });
  const project = elementAt({ left: 100, top: 620 });
  const animations = animateHomeLayoutShift([greeting, project], new Map([
    [greeting, { left: 195, top: 220 }],
    [project, { left: 50, top: 500 }],
  ]));

  assert.equal(animations.length, 2);
  assert.deepEqual(greeting.calls[0].keyframes, [
    { translate: '115px 100px', opacity: 1 },
    { translate: '0 0', opacity: 1 },
  ]);
  assert.deepEqual(project.calls[0].keyframes, [
    { translate: '-50px -120px', opacity: 1 },
    { translate: '0 0', opacity: 1 },
  ]);
  assert.deepEqual(greeting.calls[0].options, {
    duration: 520,
    easing: 'cubic-bezier(.16, 1, .3, 1)',
  });
});

test('skips unmoved elements and all motion when reduced motion is requested', () => {
  const unmoved = elementAt({ left: 80, top: 120 });
  const moved = elementAt({ left: 80, top: 120 });
  assert.deepEqual(animateHomeLayoutShift([unmoved], new Map([[unmoved, { left: 80, top: 120 }]])), []);
  assert.deepEqual(animateHomeLayoutShift([moved], new Map([[moved, { left: 0, top: 0 }]]), { reducedMotion: true }), []);
  assert.deepEqual(unmoved.calls, []);
  assert.deepEqual(moved.calls, []);
});

test('selects the visible target nearest the viewport center as the responsive anchor', () => {
  const above = elementAt({ left: 0, top: -120, height: 80 });
  const near = elementAt({ left: 0, top: 250, height: 100 });
  const below = elementAt({ left: 0, top: 580, height: 80 });
  const hidden = elementAt({ left: 0, top: 900, height: 80 });

  assert.equal(findViewportAnchor([above, near, below, hidden], new Map([
    [above, above.rect],
    [near, near.rect],
    [below, below.rect],
    [hidden, hidden.rect],
  ]), 600), near);
  assert.equal(findViewportAnchor([hidden], new Map([[hidden, hidden.rect]]), 600), null);
});

test('keeps the visible anchor at its viewport position while settling surrounding targets', async () => {
  const anchor = scrollingElementAt({ top: 250 });
  const surrounding = scrollingElementAt({ top: 500 });
  const hero = { children: [anchor, surrounding], getAnimations() { return []; } };
  const environment = scrollingEnvironment({ hero, rejectWindowScroll: true });

  initHomeBreakpointMotion(environment.root, environment.browserWindow);
  await Promise.resolve();
  await Promise.resolve();
  anchor.top = 350;
  surrounding.top = 700;
  environment.desktopMedia.cross(true);

  assert.deepEqual(environment.scrollCalls, [[0, 100]]);
  assert.equal(anchor.getBoundingClientRect().top, 250);
  assert.equal(anchor.calls.length, 0);
  assert.deepEqual(surrounding.calls[0].keyframes[0], { translate: '0px -100px', opacity: 1 });
});

test('retains unanchored FLIP behavior when no layout target is visible', async () => {
  const offscreen = scrollingElementAt({ top: 900 });
  const hero = { children: [offscreen], getAnimations() { return []; } };
  const environment = scrollingEnvironment({ hero });

  initHomeBreakpointMotion(environment.root, environment.browserWindow);
  await Promise.resolve();
  await Promise.resolve();
  offscreen.top = 1000;
  environment.desktopMedia.cross(true);

  assert.deepEqual(environment.scrollCalls, []);
  assert.deepEqual(offscreen.calls[0].keyframes[0], { translate: '0px -100px', opacity: 1 });
});

test('retains FLIP behavior without scroll compensation on a non-scrollable page', async () => {
  const anchor = scrollingElementAt({ top: 250 });
  const hero = { children: [anchor], getAnimations() { return []; } };
  const environment = scrollingEnvironment({ hero, scrollable: false });

  initHomeBreakpointMotion(environment.root, environment.browserWindow);
  await Promise.resolve();
  await Promise.resolve();
  anchor.top = 350;
  environment.desktopMedia.cross(true);

  assert.deepEqual(environment.scrollCalls, []);
  assert.deepEqual(anchor.calls[0].keyframes[0], { translate: '0px -100px', opacity: 1 });
});

test('anchors without animation when reduced motion is requested', async () => {
  const anchor = scrollingElementAt({ top: 250 });
  const hero = { children: [anchor], getAnimations() { return []; } };
  const environment = scrollingEnvironment({ hero, reduced: true });

  initHomeBreakpointMotion(environment.root, environment.browserWindow);
  await Promise.resolve();
  await Promise.resolve();
  anchor.top = 350;
  environment.desktopMedia.cross(true);

  assert.deepEqual(environment.scrollCalls, [[0, 100]]);
  assert.equal(anchor.getBoundingClientRect().top, 250);
  assert.deepEqual(anchor.calls, []);
});

test('does not animate either group on initial load or same-side resizes', async () => {
  const heroItem = elementAt({ left: 40, top: 100 });
  const publicationItem = elementAt({ left: 40, top: 600 });
  const hero = { children: [heroItem], getAnimations() { return []; } };
  const environment = motionEnvironment({ hero, publication: [publicationItem] });

  initHomeBreakpointMotion(environment.root, environment.browserWindow);
  await Promise.resolve();
  await Promise.resolve();
  environment.resize();

  assert.deepEqual(heroItem.calls, []);
  assert.deepEqual(publicationItem.calls, []);
});

test('settles only hero targets at 849/850/851 crossings', async () => {
  const heroItem = elementAt({ left: 40, top: 100 });
  const publicationItem = elementAt({ left: 40, top: 600 });
  const hero = { children: [heroItem], getAnimations() { return []; } };
  const environment = motionEnvironment({ hero, publication: [publicationItem] });

  initHomeBreakpointMotion(environment.root, environment.browserWindow);
  await Promise.resolve();
  await Promise.resolve();
  heroItem.rect = { left: 500, top: 100 }; // 849 -> 850
  environment.desktopMedia.cross(true);
  heroItem.rect = { left: 40, top: 100 }; // 850 -> 849
  environment.desktopMedia.cross(false);
  heroItem.rect = { left: 500, top: 100 }; // 849 -> 851
  environment.desktopMedia.cross(true);

  assert.equal(heroItem.calls.length, 3);
  assert.equal(publicationItem.calls.length, 0);
});

test('settles only publication targets at 759/760/761 crossings', async () => {
  const heroItem = elementAt({ left: 40, top: 100 });
  const project = elementAt({ left: 40, top: 600 });
  const writing = elementAt({ left: 40, top: 800 });
  const recommends = elementAt({ left: 40, top: 1000 });
  const hero = { children: [heroItem], getAnimations() { return []; } };
  const environment = motionEnvironment({ hero, publication: [project, writing, recommends] });

  initHomeBreakpointMotion(environment.root, environment.browserWindow);
  await Promise.resolve();
  await Promise.resolve();
  project.rect = { left: 200, top: 600 }; // 759 -> 760
  writing.rect = { left: 40, top: 800 }; // unchanged target
  recommends.rect = { left: 200, top: 1000 };
  environment.publicationMedia.cross(true);
  project.rect = { left: 40, top: 600 }; // 760 -> 759
  recommends.rect = { left: 40, top: 1000 };
  environment.publicationMedia.cross(false);
  project.rect = { left: 200, top: 600 }; // 759 -> 761
  recommends.rect = { left: 200, top: 1000 };
  environment.publicationMedia.cross(true);

  assert.equal(project.calls.length, 3);
  assert.equal(writing.calls.length, 0);
  assert.equal(recommends.calls.length, 3);
  assert.equal(heroItem.calls.length, 0);
});

test('cancels stale batches during rapid crossings and preserves the latest group', async () => {
  let left = 40;
  const animations = [];
  const target = {
    getBoundingClientRect() { return { left, top: 100 }; },
    animate() {
      let finish;
      const animation = {
        cancelled: false,
        finished: new Promise((resolve) => { finish = resolve; }),
        cancel() { this.cancelled = true; finish(); },
      };
      animations.push(animation);
      return animation;
    },
  };
  const hero = { children: [target], getAnimations() { return []; } };
  const environment = motionEnvironment({ hero });

  initHomeBreakpointMotion(environment.root, environment.browserWindow);
  await Promise.resolve();
  await Promise.resolve();
  left = 500;
  environment.desktopMedia.cross(true);
  left = 40;
  environment.desktopMedia.cross(false);
  left = 500;
  environment.desktopMedia.cross(true);

  assert.equal(animations.length, 3);
  assert.equal(animations[0].cancelled, true);
  assert.equal(animations[1].cancelled, true);
});
