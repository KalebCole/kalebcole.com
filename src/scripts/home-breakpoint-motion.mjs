export const HOME_COMPACT_MEDIA = '(min-width: 540px)';
export const HOME_PUBLICATION_MEDIA = '(min-width: 760px)';
export const HOME_WRITING_MEDIA = HOME_PUBLICATION_MEDIA;
export const HOME_DESKTOP_MEDIA = '(min-width: 850px)';
export const HOME_LAYOUT_MOTION_DURATION = 520;
export const HOME_LAYOUT_MOTION_EASING = 'cubic-bezier(.16, 1, .3, 1)';

// Each group names an element that CSS itself repositions at that breakpoint.
export const HOME_LAYOUT_GROUPS = [
  { name: 'projects', media: HOME_PUBLICATION_MEDIA, selector: '[data-home-layout-project]' },
  { name: 'writing rows', media: HOME_COMPACT_MEDIA, selector: '[data-home-layout-writing-row]' },
  { name: 'pinned writing', media: HOME_WRITING_MEDIA, selector: '[data-home-layout-writing-pinned]' },
  { name: 'recommendations compact', media: HOME_COMPACT_MEDIA, selector: '[data-home-layout-recommendation]' },
  { name: 'recommendations publication', media: HOME_PUBLICATION_MEDIA, selector: '[data-home-layout-recommendation]' },
];

const activeLayoutTargets = new Set();
const layoutSettleListeners = new Set();

function elementsOverlap(first, second) {
  if (first === second) return true;
  return Boolean(first?.contains?.(second) || second?.contains?.(first));
}

export function isHomeLayoutSettling(element) {
  for (const target of activeLayoutTargets) {
    if (elementsOverlap(element, target)) return true;
  }
  return false;
}

export function onHomeLayoutSettled(listener) {
  layoutSettleListeners.add(listener);
  return () => layoutSettleListeners.delete(listener);
}

function notifyHomeLayoutSettled() {
  for (const listener of [...layoutSettleListeners]) listener();
}

function uniqueElements(elements) {
  return [...new Set(elements)];
}

function captureRects(elements) {
  return new Map(elements.map((element) => [element, element.getBoundingClientRect()]));
}

export function findViewportAnchor(elements, previousRects, viewportHeight) {
  if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) return null;

  const viewportCenter = viewportHeight / 2;
  return elements.reduce((nearest, element) => {
    const rect = previousRects.get(element);
    if (!rect) return nearest;

    const bottom = Number.isFinite(rect.bottom)
      ? rect.bottom
      : rect.top + (Number.isFinite(rect.height) ? rect.height : 0);
    if (bottom < 0 || rect.top > viewportHeight) return nearest;

    const center = rect.top + ((bottom - rect.top) / 2);
    const distance = Math.abs(center - viewportCenter);
    return !nearest || distance < nearest.distance ? { element, distance } : nearest;
  }, null)?.element ?? null;
}

function preserveViewportAnchor(anchor, previousRects, browserWindow) {
  const previous = previousRects.get(anchor);
  if (!previous) return;

  const scrollingRoot = browserWindow.document?.scrollingElement ?? browserWindow.document?.documentElement;
  if (scrollingRoot && scrollingRoot.scrollHeight <= scrollingRoot.clientHeight) return;
  if (scrollingRoot?.scrollTop <= 0) return;

  const displacement = anchor.getBoundingClientRect().top - previous.top;
  if (Math.abs(displacement) < 0.5) return;

  if (scrollingRoot) scrollingRoot.scrollTop += displacement;
  else if (typeof browserWindow.scrollBy === 'function') browserWindow.scrollBy(0, displacement);
}

export function animateHomeLayoutShift(
  elements,
  previousRects,
  { reducedMotion = false } = {},
) {
  if (reducedMotion) return [];

  return elements.flatMap((element) => {
    const previous = previousRects.get(element);
    if (!previous || typeof element.animate !== 'function') return [];

    const current = element.getBoundingClientRect();
    const x = previous.left - current.left;
    const y = previous.top - current.top;
    const width = previous.width / current.width;
    const height = previous.height / current.height;
    const moved = Math.abs(x) >= 0.5 || Math.abs(y) >= 0.5
      || (Number.isFinite(width) && Math.abs(width - 1) >= 0.01)
      || (Number.isFinite(height) && Math.abs(height - 1) >= 0.01);
    if (!moved) return [];

    const firstKeyframe = { translate: `${x}px ${y}px`, opacity: 1 };
    if (Number.isFinite(width) && Number.isFinite(height) && (Math.abs(width - 1) >= 0.01 || Math.abs(height - 1) >= 0.01)) {
      firstKeyframe.scale = `${width} ${height}`;
    }

    return element.animate(
      [
        firstKeyframe,
        { translate: '0 0', opacity: 1 },
      ],
      {
        duration: HOME_LAYOUT_MOTION_DURATION,
        easing: HOME_LAYOUT_MOTION_EASING,
      },
    );
  });
}

export function initHomeBreakpointMotion(root = document, browserWindow = window) {
  if (!root || typeof root.querySelectorAll !== 'function' || typeof browserWindow.matchMedia !== 'function') return;

  const hero = root.querySelector?.('.home-hero');
  const groups = [
    hero && {
      name: 'hero',
      elements: Array.from(hero.children),
      media: browserWindow.matchMedia(HOME_DESKTOP_MEDIA),
    },
    ...HOME_LAYOUT_GROUPS.map((definition) => ({
      ...definition,
      elements: Array.from(root.querySelectorAll(definition.selector)),
      media: browserWindow.matchMedia(definition.media),
    })),
  ].filter((group) => group?.elements.length > 0);
  if (groups.length === 0) return;

  const reducedMotion = browserWindow.matchMedia('(prefers-reduced-motion: reduce)');
  let activeAnimations = [];
  let motionVersion = 0;
  let resizeFrame;

  const updateRects = () => {
    for (const group of groups) {
      group.previousRects = captureRects(group.elements);
      group.matches = group.media.matches;
    }
  };

  const measureResize = () => {
    resizeFrame = undefined;
    const crossingGroups = groups.filter((group) => group.media.matches !== group.matches);
    if (crossingGroups.length === 0) {
      if (activeAnimations.length === 0) updateRects();
      return;
    }

    const version = ++motionVersion;
    for (const animation of activeAnimations) animation.cancel();
    activeLayoutTargets.clear();

    const targets = uniqueElements(crossingGroups.flatMap((group) => group.elements));
    const previousRects = new Map(crossingGroups.flatMap((group) => group.elements.map((element) => [
      element,
      group.previousRects.get(element),
    ])));
    const anchorTargets = uniqueElements(groups.flatMap((group) => group.elements));
    const anchorPreviousRects = new Map(groups.flatMap((group) => group.elements.map((element) => [
      element,
      group.previousRects.get(element),
    ])));
    const anchor = findViewportAnchor(anchorTargets, anchorPreviousRects, browserWindow.innerHeight);
    if (anchor) preserveViewportAnchor(anchor, anchorPreviousRects, browserWindow);

    const movedElements = targets.filter((element) => {
      const previous = previousRects.get(element);
      const current = element.getBoundingClientRect();
      if (!previous) return false;
      const width = previous.width / current.width;
      const height = previous.height / current.height;
      return (
        Math.abs(previous.left - current.left) >= 0.5
        || Math.abs(previous.top - current.top) >= 0.5
        || (Number.isFinite(width) && Math.abs(width - 1) >= 0.01)
        || (Number.isFinite(height) && Math.abs(height - 1) >= 0.01)
      );
    });
    activeAnimations = animateHomeLayoutShift(targets, previousRects, {
      reducedMotion: reducedMotion.matches,
    });
    if (activeAnimations.length > 0) movedElements.forEach((element) => activeLayoutTargets.add(element));
    updateRects();

    const finished = activeAnimations
      .map((animation) => animation.finished)
      .filter(Boolean)
      .map((promise) => promise.catch(() => undefined));
    Promise.all(finished).then(() => {
      if (version !== motionVersion) return;
      activeAnimations = [];
      activeLayoutTargets.clear();
      updateRects();
      notifyHomeLayoutSettled();
    });
  };

  const onResize = () => {
    if (resizeFrame && typeof browserWindow.cancelAnimationFrame === 'function') {
      browserWindow.cancelAnimationFrame(resizeFrame);
    }
    resizeFrame = browserWindow.requestAnimationFrame(measureResize);
  };

  const start = () => {
    updateRects();
    for (const group of groups) {
      if (typeof group.media.addEventListener === 'function') group.media.addEventListener('change', onResize);
      else if (typeof group.media.addListener === 'function') group.media.addListener(onResize);
    }
    browserWindow.addEventListener('resize', onResize, { passive: true });
  };

  const entranceAnimations = hero && typeof hero.getAnimations === 'function'
    ? hero.getAnimations({ subtree: true })
    : [];
  browserWindow.requestAnimationFrame(() => {
    Promise.allSettled(entranceAnimations.map((animation) => animation.finished)).then(start);
  });
}
