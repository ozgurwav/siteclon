import { EditableText } from '../admin/EditableText';

export function CopyrightBar() {
  return (
    <div className="max-w-[1200px] mx-auto px-6 py-8 flex justify-between items-center text-sm text-[#051A24]/60">
      <span>
        <EditableText assetKey="copyright.left" defaultValue="Vortex Studio Limited" as="span" />
      </span>
      <span>
        <EditableText assetKey="copyright.right" defaultValue="Austin, USA" as="span" />
      </span>
    </div>
  );
}
