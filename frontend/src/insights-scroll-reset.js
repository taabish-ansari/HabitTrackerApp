/* Insights scroll reset: the Insights view should use the document scrollbar only. */
const tracked = new Map();

function restore() {
  for (const [element, values] of tracked) {
    element.style.removeProperty('overflow');
    element.style.removeProperty('overflow-y');
    element.style.removeProperty('overflow-x');
    element.style.removeProperty('height');
    element.style.removeProperty('max-height');
    if (values.overflow) element.style.setProperty('overflow', values.overflow.value, values.overflow.priority);
    if (values.overflowY) element.style.setProperty('overflow-y', values.overflowY.value, values.overflowY.priority);
    if (values.overflowX) element.style.setProperty('overflow-x', values.overflowX.value, values.overflowX.priority);
    if (values.height) element.style.setProperty('height', values.height.value, values.height.priority);
    if (values.maxHeight) element.style.setProperty('max-height', values.maxHeight.value, values.maxHeight.priority);
  }
  tracked.clear();
}

function sync() {
  const insights = document.querySelector('.insights-enhancer-shell');
  if (!insights) {
    restore();
    return;
  }

  const ancestors = [];
  let element = insights.parentElement;
  while (element && element !== document.body) {
    ancestors.push(element);
    element = element.parentElement;
  }

  for (const ancestor of ancestors) {
    if (!tracked.has(ancestor)) {
      tracked.set(ancestor, {
        overflow: { value: ancestor.style.getPropertyValue('overflow'), priority: ancestor.style.getPropertyPriority('overflow') },
        overflowY: { value: ancestor.style.getPropertyValue('overflow-y'), priority: ancestor.style.getPropertyPriority('overflow-y') },
        overflowX: { value: ancestor.style.getPropertyValue('overflow-x'), priority: ancestor.style.getPropertyPriority('overflow-x') },
        height: { value: ancestor.style.getPropertyValue('height'), priority: ancestor.style.getPropertyPriority('height') },
        maxHeight: { value: ancestor.style.getPropertyValue('max-height'), priority: ancestor.style.getPropertyPriority('max-height') },
      });
    }
    ancestor.style.setProperty('overflow', 'visible', 'important');
    ancestor.style.setProperty('overflow-y', 'visible', 'important');
    ancestor.style.setProperty('overflow-x', 'visible', 'important');
    ancestor.style.setProperty('height', 'auto', 'important');
    ancestor.style.setProperty('max-height', 'none', 'important');
  }
}

const observer = new MutationObserver(sync);
observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
sync();
