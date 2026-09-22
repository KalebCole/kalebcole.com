export const HOME_DESKTOP_MEDIA = '(min-width: 850px)';
export const HOME_PUBLICATION_MEDIA = '(min-width: 760px)';
export const HOME_LAYOUT_MOTION_DURATION = 520;
export const HOME_LAYOUT_MOTION_EASING = 'cubic-bezier(.16, 1, .3, 1)';
const activeLayoutTargets = new Set();

export function isHomeLayoutSettling(element) {
  return activeLayoutTargets.has(element);
}

function captureRects(elements) {
  return new Map(elements.map((element) => [element, element.getBoundingClientRect()]));
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
    if (Math.abs(x) < 0.5 && Math.abs(y) < 0.5) return [];

    return element.animate(
      [
        { translate: `${x}px ${y}px`, opacity: 1 },
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
  const hero = root.querySelector('.home-hero');
  if (!hero || typeof browserWindow.matchMedia !== 'function') return;

  const groups = [
    {
      elements: Array.from(hero.children),
      media: browserWindow.matchMedia(HOME_DESKTOP_MEDIA),
    },
    {
      elements: Array.from(root.querySelectorAll?.('[data-home-layout-settle]') ?? []),
      media: browserWindow.matchMedia(HOME_PUBLICATION_MEDIA),
    },
  ].filter(({ elements }) => elements.length > 0);
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
    activeAnimations = crossingGroups.flatMap((group) => {
      const movedElements = group.elements.filter((element) => {
        const previous = group.previousRects.get(element);
        const current = element.getBoundingClientRect();
        return previous && (Math.abs(previous.left - current.left) >= 0.5 || Math.abs(previous.top - current.top) >= 0.5);
      });
      const animations = animateHomeLayoutShift(group.elements, group.previousRects, {
        reducedMotion: reducedMotion.matches,
      });
      if (animations.length > 0) movedElements.forEach((element) => activeLayoutTargets.add(element));
      return animations;
    });
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

  browserWindow.requestAnimationFrame(() => {
    const entranceAnimations = typeof hero.getAnimations === 'function'
      ? hero.getAnimations({ subtree: true })
      : [];
    Promise.allSettled(entranceAnimations.map((animation) => animation.finished)).then(start);
  });
}
