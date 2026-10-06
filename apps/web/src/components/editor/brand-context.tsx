'use client';

/** The brand kit in use in the editor (chosen in the Brand panel, remembered per browser). */
import { createContext, type ReactNode, useContext, useMemo, useState } from 'react';
import { BrandColorsContext } from '@/components/ui/color-field';
import { useBrands } from '@/hooks/use-brands';
import { type BrandRecord, brandColors, getActiveBrandId, setActiveBrandId } from '@/lib/storage/brands';

interface EditorBrand {
  brands: BrandRecord[] | null;
  brand: BrandRecord | null;
  setBrand: (id: string) => void;
}

const Context = createContext<EditorBrand>({ brands: null, brand: null, setBrand: () => {} });

export function useEditorBrand(): EditorBrand {
  return useContext(Context);
}

export function BrandProvider({ children }: { children: ReactNode }) {
  const { brands } = useBrands();
  const [activeId, setActiveId] = useState<string | null>(() => getActiveBrandId());
  const brand = brands?.find((b) => b.id === activeId) ?? brands?.[0] ?? null;
  const value = useMemo<EditorBrand>(
    () => ({
      brands,
      brand,
      setBrand: (id) => {
        setActiveBrandId(id);
        setActiveId(id);
      },
    }),
    [brands, brand],
  );
  const colors = useMemo(() => brandColors(brand), [brand]);
  return (
    <Context.Provider value={value}>
      <BrandColorsContext.Provider value={colors}>{children}</BrandColorsContext.Provider>
    </Context.Provider>
  );
}
