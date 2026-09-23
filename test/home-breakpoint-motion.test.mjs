import assert from 'node:assert/strict';
import test from 'node:test';
import {
  HOME_ACTIONS_INLINE_MEDIA,
  HOME_COMPACT_MEDIA,
  HOME_DESKTOP_MEDIA,
  HOME_PUBLICATION_MEDIA,
  HOME_WRITING_MEDIA,
  animateHomeLayoutShift,
  findViewportAnchor,
  initHomeBreakpointMotion,
  isHomeLayoutSettling,
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
    setMatches(next) { this.matches = next; },
  };
}

function motionEnvironment({
  hero,
  projects = [],
  writingRows = [],
  writingPinned = [],
  recommendations = [],
  actions = [],
  desktop = false,
  actionsInline = false,
  compact = false,
  publicationWide = false,
  reduced = false,
}) {
  const desktopMedia = media(desktop);
  const actionsInlineMedia = media(actionsInline);
  const compactMedia = media(compact);
  const publicationMedia = media(publicationWide);
  const reducedMotion = media(reduced);
  const resizeListeners = [];
  const browserWindow = {
    matchMedia(query) {
      if (query === HOME_DESKTOP_MEDIA) return desktopMedia;
      if (query === HOME_ACTIONS_INLINE_MEDIA) return actionsInlineMedia;
      if (query === HOME_COMPACT_MEDIA) return compactMedia;
      if (query === HOME_PUBLICATION_MEDIA) return publicationMedia;
      return reducedMotion;
    },
    requestAnimationFrame(callback) { callback(); return 1; },
    cancelAnimationFrame() {},
    addEventListener(type, listener) { if (type === 'resize') resizeListeners.push(listener); },
  };
  const targets = {
    '.home-actions': actions,
    '[data-home-layout-project]': projects,
    '[data-home-layout-writing-row]': writingRows,
    '[data-home-layout-writing-pinned]': writingPinned,
    '[data-home-layout-recommendation]': recommendations,
  };
  return {
    browserWindow,
    compactMedia,
    actionsInlineMedia,
    desktopMedia,
    publicationMedia,
    root: {
      querySelector(selector) { return selector === '.home-hero' ? hero : null; },
      querySelectorAll(selector) { return targets[selector] ?? []; },
    },
    resize() { for (const listener of resizeListeners) listener(); },
  };
}

function scrollingEnvironment({
  hero,
  projects = [],
  writingRows = [],
  writingPinned = [],
  recommendations = [],
  reduced = false,
  viewportHeight = 600,
  scrollable = true,
  rejectWindowScroll = false,
  initialScrollTop = 0,
}) {
  const environment = motionEnvironment({ hero, projects, writingRows, writingPinned, recommendations, reduced });
  const layoutTargets = [...hero.children, ...projects, ...writingRows, ...writingPinned, ...recommendations];
  const scrollCalls = [];
  environment.browserWindow.innerHeight = viewportHeight;
  const scrollingElement = {
    scrollHeight: scrollable ? viewportHeight * 2 : viewportHeight,
    clientHeight: viewportHeight,
  };
  let scrollTop = initialScrollTop;
  Object.defineProperty(scrollingElement, 'scrollTop', {
    get() { return scrollTop; },
    set(next) {
      const delta = next - scrollTop;
      scrollTop = next;
      scrollCalls.push([0, delta]);
      for (const element of layoutTargets) element.viewportOffset += delta;
    },
  });
  environment.browserWindow.document = {
    scrollingElement,
  };
  environment.browserWindow.scrollBy = rejectWindowScroll
    ? () => { throw new Error('viewport anchoring must not request browser smooth scrolling'); }
    : (x, y) => {
      scrollCalls.push([x, y]);
      for (const element of layoutTargets) element.viewportOffset += y;
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

test('uses the actual CSS breakpoint media queries for each homepage layout group', () => {
  assert.equal(HOME_COMPACT_MEDIA, '(min-width: 540px)');
  assert.equal(HOME_WRITING_MEDIA, '(min-width: 760px)');
  assert.equal(HOME_PUBLICATION_MEDIA, '(min-width: 760px)');
  assert.equal(HOME_DESKTOP_MEDIA, '(min-width: 850px)');
  assert.equal(HOME_ACTIONS_INLINE_MEDIA, '(min-width: 987px)');
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

test('settles pure responsive resizes with an opaque scale keyframe', () => {
  const visual = elementAt({ left: 20, top: 400, width: 130, height: 74 });
  const animations = animateHomeLayoutShift([visual], new Map([[
    visual,
    { left: 20, top: 400, width: 500, height: 281 },
  ]]));

  assert.equal(animations.length, 1);
  assert.deepEqual(visual.calls[0].keyframes, [
    { translate: '0px 0px', opacity: 1, scale: '3.8461538461538463 3.7972972972972974' },
    { translate: '0 0', opacity: 1 },
  ]);
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

test('treats a Story Beat inside an active layout-settle wrapper as settling', async () => {
  const wrapper = elementAt({ left: 40, top: 700 });
  const beat = { parentElement: wrapper };
  const hero = { children: [], getAnimations() { return []; } };
  wrapper.contains = (element) => element === beat;
  const environment = motionEnvironment({ hero, projects: [wrapper] });

  initHomeBreakpointMotion(environment.root, environment.browserWindow);
  await Promise.resolve();
  await Promise.resolve();
  wrapper.rect = { left: 200, top: 700 };
  environment.publicationMedia.cross(true);

  assert.equal(isHomeLayoutSettling(wrapper), true);
  assert.equal(isHomeLayoutSettling(beat), true);
});

test('keeps the visible anchor at its viewport position while settling surrounding targets', async () => {
  const anchor = scrollingElementAt({ top: 250 });
  const surrounding = scrollingElementAt({ top: 500 });
  const hero = { children: [anchor, surrounding], getAnimations() { return []; } };
  const environment = scrollingEnvironment({ hero, rejectWindowScroll: true, initialScrollTop: 100 });

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

test('keeps document-top readers at scroll position zero through a hero reflow', async () => {
  const heading = scrollingElementAt({ top: 100 });
  const actions = scrollingElementAt({ top: 280 });
  const hero = { children: [heading, actions], getAnimations() { return []; } };
  const environment = scrollingEnvironment({ hero, rejectWindowScroll: true });

  initHomeBreakpointMotion(environment.root, environment.browserWindow);
  await Promise.resolve();
  await Promise.resolve();
  heading.top = 120;
  actions.top = 530;
  environment.desktopMedia.cross(true);

  assert.deepEqual(environment.scrollCalls, [], 'document-top readers must not be manually scrolled to a hero target');
  assert.equal(actions.calls.length, 1, 'hero targets still settle normally');
  assert.deepEqual(actions.calls[0].keyframes[0], { translate: '0px -250px', opacity: 1 });
});

test('anchors visible Writing and Recommendation targets through a hero-only 849 to 850 crossing', async () => {
  for (const [name, targetKey] of [['Writing', 'writingRows'], ['Recommendations', 'recommendations']]) {
    const heroItem = scrollingElementAt({ top: -100 });
    const readerTarget = scrollingElementAt({ top: 250 });
    const hero = { children: [heroItem], getAnimations() { return []; } };
    const environment = scrollingEnvironment({
      hero,
      [targetKey]: [readerTarget],
      rejectWindowScroll: true,
      initialScrollTop: 100,
    });

    initHomeBreakpointMotion(environment.root, environment.browserWindow);
    await Promise.resolve();
    await Promise.resolve();
    heroItem.top = -150;
    readerTarget.top = 150;
    environment.desktopMedia.cross(true);

    assert.deepEqual(environment.scrollCalls, [[0, -100]], `${name} preserves the reader viewport position`);
    assert.equal(readerTarget.getBoundingClientRect().top, 250, `${name} remains at its prior viewport position`);
    assert.equal(readerTarget.calls.length, 0, `${name} does not animate without crossing its own breakpoint`);
    assert.equal(heroItem.calls.length, 1, `${name} still allows only hero targets to animate`);
  }
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
  const environment = scrollingEnvironment({ hero, reduced: true, initialScrollTop: 100 });

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
  const environment = motionEnvironment({ hero, projects: [publicationItem] });

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
  const environment = motionEnvironment({ hero, projects: [publicationItem] });

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

test('settles only explicitly marked hero layout targets at the desktop crossing', async () => {
  const markedHeroItem = elementAt({ left: 40, top: 100 });
  const unmarkedHeroItem = elementAt({ left: 40, top: 180 });
  const hero = {
    children: [markedHeroItem, unmarkedHeroItem],
    getAnimations() { return []; },
    querySelectorAll(selector) { return selector === '[data-home-layout-hero]' ? [markedHeroItem] : []; },
  };
  const environment = motionEnvironment({ hero });

  initHomeBreakpointMotion(environment.root, environment.browserWindow);
  await Promise.resolve();
  await Promise.resolve();
  markedHeroItem.rect = { left: 500, top: 100 };
  unmarkedHeroItem.rect = { left: 500, top: 180 };
  environment.desktopMedia.cross(true);

  assert.equal(markedHeroItem.calls.length, 1);
  assert.equal(unmarkedHeroItem.calls.length, 0);
});

test('settles real Writing row and Recommendation visual/body targets at 539/540/541', async () => {
  const heroItem = elementAt({ left: 40, top: 100 });
  const writingCopy = elementAt({ left: 40, top: 800 });
  const writingDate = elementAt({ left: 40, top: 860 });
  const recommendationVisual = elementAt({ left: 40, top: 1000 });
  const recommendationBody = elementAt({ left: 40, top: 1250 });
  const project = elementAt({ left: 40, top: 600 });
  const pinnedCopy = elementAt({ left: 40, top: 700 });
  const hero = { children: [heroItem], getAnimations() { return []; } };
  const environment = motionEnvironment({
    hero,
    projects: [project],
    writingRows: [writingCopy, writingDate],
    writingPinned: [pinnedCopy],
    recommendations: [recommendationVisual, recommendationBody],
  });

  initHomeBreakpointMotion(environment.root, environment.browserWindow);
  await Promise.resolve();
  await Promise.resolve();
  writingDate.rect = { left: 400, top: 800 };
  recommendationVisual.rect = { left: 40, top: 1000, width: 130 };
  recommendationBody.rect = { left: 200, top: 1000, width: 350 };
  environment.compactMedia.cross(true); // 539 -> 540
  writingDate.rect = { left: 40, top: 860 };
  recommendationVisual.rect = { left: 40, top: 1000, width: 500 };
  recommendationBody.rect = { left: 40, top: 1250, width: 500 };
  environment.compactMedia.cross(false); // 540 -> 539
  writingDate.rect = { left: 400, top: 800 };
  recommendationVisual.rect = { left: 40, top: 1000, width: 130 };
  recommendationBody.rect = { left: 200, top: 1000, width: 350 };
  environment.compactMedia.cross(true); // 539 -> 541

  assert.equal(writingCopy.calls.length, 0);
  assert.equal(writingDate.calls.length, 3);
  assert.equal(recommendationVisual.calls.length, 2);
  assert.equal(recommendationBody.calls.length, 3);
  assert.equal(project.calls.length, 0);
  assert.equal(pinnedCopy.calls.length, 0);
  assert.equal(heroItem.calls.length, 0);
});

test('settles pinned Writing and Recommendation targets at 759/760/761', async () => {
  const project = elementAt({ left: 40, top: 600 });
  const pinnedCopy = elementAt({ left: 40, top: 800 });
  const pinnedNote = elementAt({ left: 40, top: 1000 });
  const recommendationVisual = elementAt({ left: 40, top: 1200 });
  const recommendationBody = elementAt({ left: 200, top: 1200 });
  const writingRow = elementAt({ left: 40, top: 1400 });
  const hero = { children: [], getAnimations() { return []; } };
  const environment = motionEnvironment({
    hero,
    projects: [project],
    writingRows: [writingRow],
    writingPinned: [pinnedCopy, pinnedNote],
    recommendations: [recommendationVisual, recommendationBody],
    compact: true,
  });

  initHomeBreakpointMotion(environment.root, environment.browserWindow);
  await Promise.resolve();
  await Promise.resolve();
  project.rect = { left: 200, top: 600 };
  pinnedNote.rect = { left: 500, top: 800 };
  recommendationVisual.rect = { left: 40, top: 1200, width: 144 };
  recommendationBody.rect = { left: 200, top: 1200, width: 350 };
  environment.publicationMedia.cross(true); // 759 -> 760
  project.rect = { left: 40, top: 600 };
  pinnedNote.rect = { left: 40, top: 1000 };
  recommendationVisual.rect = { left: 40, top: 1200, width: 130 };
  recommendationBody.rect = { left: 200, top: 1200, width: 350 };
  environment.publicationMedia.cross(false); // 760 -> 759
  project.rect = { left: 200, top: 600 };
  pinnedNote.rect = { left: 500, top: 800 };
  recommendationVisual.rect = { left: 40, top: 1200, width: 144 };
  environment.publicationMedia.cross(true); // 759 -> 761

  assert.equal(project.calls.length, 3);
  assert.equal(pinnedCopy.calls.length, 0);
  assert.equal(pinnedNote.calls.length, 3);
  assert.equal(recommendationVisual.calls.length, 2);
  assert.equal(recommendationBody.calls.length, 0);
  assert.equal(writingRow.calls.length, 0);
});

test('deduplicates shared Recommendation targets across a simultaneous 539/761 resize in both directions', async () => {
  const project = elementAt({ left: 40, top: 600, width: 500, height: 80 });
  const writingDate = elementAt({ left: 40, top: 860, width: 500, height: 24 });
  const recommendationVisual = elementAt({ left: 40, top: 1000, width: 500, height: 281 });
  const recommendationBody = elementAt({ left: 40, top: 1250, width: 500, height: 180 });
  const hero = { children: [], getAnimations() { return []; } };
  const environment = motionEnvironment({
    hero,
    projects: [project],
    writingRows: [writingDate],
    recommendations: [recommendationVisual, recommendationBody],
  });

  initHomeBreakpointMotion(environment.root, environment.browserWindow);
  await Promise.resolve();
  await Promise.resolve();

  // One resize measurement jumps from 539px to 761px, crossing both groups.
  project.rect = { left: 200, top: 600, width: 350, height: 80 };
  writingDate.rect = { left: 400, top: 800, width: 130, height: 24 };
  recommendationVisual.rect = { left: 40, top: 1000, width: 144, height: 81 };
  recommendationBody.rect = { left: 200, top: 1000, width: 350, height: 180 };
  environment.compactMedia.setMatches(true);
  environment.publicationMedia.setMatches(true);
  environment.resize();

  assert.equal(recommendationVisual.calls.length, 1);
  assert.equal(recommendationBody.calls.length, 1);
  assert.equal(project.calls.length, 1);
  assert.equal(writingDate.calls.length, 1);
  assert.deepEqual(recommendationVisual.calls[0].keyframes[0], {
    translate: '0px 0px', opacity: 1, scale: '3.4722222222222223 3.4691358024691357',
  });

  // One resize measurement jumps from 761px to 539px, crossing both groups.
  project.rect = { left: 40, top: 600, width: 500, height: 80 };
  writingDate.rect = { left: 40, top: 860, width: 500, height: 24 };
  recommendationVisual.rect = { left: 40, top: 1000, width: 500, height: 281 };
  recommendationBody.rect = { left: 40, top: 1250, width: 500, height: 180 };
  environment.compactMedia.setMatches(false);
  environment.publicationMedia.setMatches(false);
  environment.resize();

  assert.equal(recommendationVisual.calls.length, 2);
  assert.equal(recommendationBody.calls.length, 2);
  assert.equal(project.calls.length, 2);
  assert.equal(writingDate.calls.length, 2);
  assert.deepEqual(recommendationBody.calls[1].keyframes[0], {
    translate: '160px -250px', opacity: 1, scale: '0.7 1',
  });
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
  const hero = { children: [], getAnimations() { return []; } };
  const environment = motionEnvironment({ hero, recommendations: [target] });

  initHomeBreakpointMotion(environment.root, environment.browserWindow);
  await Promise.resolve();
  await Promise.resolve();
  left = 500;
  environment.compactMedia.cross(true);
  left = 40;
  environment.compactMedia.cross(false);
  left = 500;
  environment.compactMedia.cross(true);

  assert.equal(animations.length, 3);
  assert.equal(animations[0].cancelled, true);
  assert.equal(animations[1].cancelled, true);
});
