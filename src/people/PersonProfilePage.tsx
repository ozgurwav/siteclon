import { useEffect, useMemo } from 'react';
import { ChevronLeft } from 'lucide-react';
import { EditableAsset } from '../admin/EditableAsset';
import { EditableText } from '../admin/EditableText';
import { readJsonAsset } from '../admin/assets';

type Person = {
  id: string;
  keyBase: string;
  imageDefault: string;
};

const PEOPLE_LIST_KEY = 'peopleCarousel.items';

export function PersonProfilePage() {
  const personId = useMemo(() => {
    if (typeof window === 'undefined') return '';
    const u = new URL(window.location.href);
    return String(u.searchParams.get('pid') || '').trim();
  }, []);

  const person = useMemo(() => {
    const people = (readJsonAsset<Person[]>(PEOPLE_LIST_KEY) || []).filter(Boolean);
    return people.find((p) => p.id === personId) || null;
  }, [personId]);

  const keyBase = person?.keyBase || 'testimonialSection';
  const defaultPortrait = person?.imageDefault || '';

  // Ensure any overscroll/background stays premium-black on this route.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const body = document.body;
    const prev = body.style.backgroundColor;
    body.style.backgroundColor = '#000';
    return () => {
      body.style.backgroundColor = prev;
    };
  }, []);

  return (
    <main className="min-h-screen bg-black">
      <div className="min-h-screen flex flex-col md:flex-row">
        {/* Left text */}
        <div className="w-full md:w-[44%] bg-black px-6 md:px-12 py-10 md:py-14 flex flex-col justify-center">
          <a href="/" className="inline-flex items-center gap-2 text-sm text-white/70 hover:text-white">
            <ChevronLeft className="h-4 w-4" />
            Anasayfa
          </a>

          <div className="mt-10">
            <div className="text-xs uppercase tracking-[0.2em] text-white/55">
              <EditableText assetKey={`${keyBase}.label`} defaultValue="Kurucu" as="span" />
            </div>

            <div className="mt-3 text-[34px] md:text-[40px] leading-[1.05] font-semibold text-white tracking-tight">
              <EditableText assetKey={`${keyBase}.author`} defaultValue="Retro Fotoğraf Ekibi" as="span" />
            </div>

            <div className="mt-6 text-sm md:text-base text-white/75 leading-relaxed max-w-xl">
              <EditableText assetKey={`${keyBase}.bio`} defaultValue="Write a short bio / motivation here." as="span" multiline />
            </div>

            <div className="mt-6 text-sm md:text-base text-white/70 leading-relaxed max-w-xl">
              <EditableText assetKey={`${keyBase}.extra`} defaultValue="Bu alana ek metin yazabilirsiniz." as="span" multiline />
            </div>

            <div className="mt-6 text-sm md:text-base text-white/70 leading-relaxed max-w-xl">
              <EditableText assetKey={`${keyBase}.motivation`} defaultValue="Motivasyon / kısa söz" as="span" multiline />
            </div>
          </div>
        </div>

        {/* Right portrait */}
        <div className="w-full md:w-[56%] bg-black flex items-center justify-center">
          <div className="w-full h-[56vh] md:h-screen">
            <EditableAsset
              assetKey={`${keyBase}.portrait`}
              defaultValue={defaultPortrait}
              alt="Portrait"
              kind="auto"
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      </div>
    </main>
  );
}
