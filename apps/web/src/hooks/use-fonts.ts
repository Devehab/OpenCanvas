'use client';

import { useEffect, useState } from 'react';
import { CUSTOM_FONTS_EVENT, startCustomFonts } from '@/lib/custom-fonts';
import { allFonts, type FontFamilyInfo } from '@/lib/fonts';

/** Bundled and uploaded font families; re-renders when uploads change. */
export function useFontCatalog(): readonly FontFamilyInfo[] {
  const [fonts, setFonts] = useState(allFonts);
  useEffect(() => {
    const update = () => setFonts(allFonts());
    window.addEventListener(CUSTOM_FONTS_EVENT, update);
    void startCustomFonts().then(update);
    return () => window.removeEventListener(CUSTOM_FONTS_EVENT, update);
  }, []);
  return fonts;
}
