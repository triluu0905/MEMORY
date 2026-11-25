import viToEn from './language-map.json';
const translations: Record<string, string> = viToEn;

export type Language = 'vi' | 'en';

// Keep user-facing translations in one JSON map shared with the Settings export.
const enToVi = Object.fromEntries(Object.entries(translations).map(([vi, en]) => [en, vi]));
let currentLanguage: Language = 'vi';

function translated(value: string): string {
  const trimmed = value.trim();
  const dict = currentLanguage === 'en' ? translations : enToVi;
  const replacement = dict[trimmed];
  return replacement === undefined ? value : value.replace(trimmed, replacement);
}

export function translateText(value: string): string { return translated(value); }

function translateTree(root: Node): void {
  if (root.nodeType === Node.TEXT_NODE && root.nodeValue) {
    root.nodeValue = translated(root.nodeValue);
    return;
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const value = node.nodeValue || '';
    const result = translated(value);
    if (result !== value) node.nodeValue = result;
  }
  const translateAttributes = (element: Element) => {
    for (const attr of ['placeholder', 'title', 'aria-label']) {
      const value = element.getAttribute(attr);
      if (value) element.setAttribute(attr, translated(value));
    }
  };
  if (root instanceof Element) translateAttributes(root);
  const elements = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  while ((node = elements.nextNode())) {
    if (node instanceof Element) translateAttributes(node);
  }
}

export function setLanguage(language: Language): void {
  currentLanguage = language === 'en' ? 'en' : 'vi';
  document.documentElement.lang = currentLanguage;
  translateTree(document.body);
}

export function language(): Language { return currentLanguage; }

export function languageMapping(): Array<{ vi: string; en: string }> {
  return Object.entries(translations).map(([vi, en]) => ({ vi, en }));
}

export function installTranslations(): void {
  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'characterData' && record.target.nodeValue) {
        const original = record.target.nodeValue;
        const result = translated(original);
        if (result !== original) record.target.nodeValue = result;
      }
      record.addedNodes.forEach(node => translateTree(node));
    }
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true });
  translateTree(document.body);
}
