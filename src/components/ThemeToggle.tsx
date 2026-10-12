'use client';

import { useEffect, useState } from 'react';

type Choice = 'system' | 'light' | 'dark';
const NEXT: Record<Choice, Choice> = { system: 'light', light: 'dark', dark: 'system' };
const LABEL: Record<Choice, string> = { system: '🖥 System', light: '☀ Light', dark: '🌙 Dark' };

function apply(choice: Choice) {
  const dark = choice === 'dark' || (choice === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

/** Cycles System → Light → Dark. The choice is remembered in this browser only. */
export default function ThemeToggle({ className }: { className?: string }) {
  const [choice, setChoice] = useState<Choice>('system');

  useEffect(() => {
    try {
      const saved = localStorage.getItem('crm_theme');
      if (saved === 'light' || saved === 'dark') setChoice(saved);
    } catch {}
  }, []);

  // While on "System", follow OS changes live.
  useEffect(() => {
    if (choice !== 'system') return;
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => apply('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [choice]);

  function cycle() {
    const next = NEXT[choice];
    setChoice(next);
    try {
      if (next === 'system') localStorage.removeItem('crm_theme');
      else localStorage.setItem('crm_theme', next);
    } catch {}
    apply(next);
  }

  return (
    <button onClick={cycle} className={className} title="Switch theme: system / light / dark">
      {LABEL[choice]}
    </button>
  );
}
