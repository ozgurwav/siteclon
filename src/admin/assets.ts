import { useMemo } from 'react';
import { useAdmin } from './AdminContext';
import { clearAsset as clearAssetStore, readAsset as readAssetStore, writeAsset as writeAssetStore } from './siteAssetsStore';

export { readJsonAsset, writeJsonAsset, readAsset, writeAsset, clearAsset } from './siteAssetsStore';
export {
  hydrateSiteAssets,
  initSiteAssetsFromLocalStorage,
  flushSiteAssetsPending,
  setServerAssetWritesEnabled,
  subscribeSiteAssets,
  hasSiteAssetsHydrateSettled,
  forceSiteAssetsHydrateGateIfPending,
} from './siteAssetsStore';

export function useEditableAsset(assetKey: string, defaultValue: string) {
  const { assetsVersion } = useAdmin();

  const value = useMemo(() => {
    void assetsVersion;
    return readAssetStore(assetKey) ?? defaultValue;
  }, [assetKey, defaultValue, assetsVersion]);

  return {
    value,
    setValue: (next: string) => {
      writeAssetStore(assetKey, next);
    },
    reset: () => {
      clearAssetStore(assetKey);
    },
  };
}

export async function fileToDataUrl(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const base64 = btoa(binary);
  return `data:${file.type || 'application/octet-stream'};base64,${base64}`;
}
