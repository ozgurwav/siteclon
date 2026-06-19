import { useInViewAnimation } from '../hooks/useInViewAnimation';
import { cn } from '../lib/utils';
import { EditableAsset } from '../admin/EditableAsset';
import { EditableText } from '../admin/EditableText';
import { HOMEPAGE_PROJECT_ROWS } from '../lib/defaultSiteMedia';

export type ProjectRowStatic = {
  title: string;
  description: string;
  image: string;
};

/** Tek büyük proje satırı (`HomeMediaSections` sırasıyla da kullanılır) */
export function ProjectMediaRow({
  row,
}: {
  row: (typeof HOMEPAGE_PROJECT_ROWS)[number];
}) {
  const project: ProjectRowStatic = {
    title: row.title,
    description: row.description,
    image: row.defaultImage,
  };
  return (
    <section className="max-w-[1200px] mx-auto px-6 py-12 md:py-16">
      <ProjectItem project={project} />
    </section>
  );
}

function ProjectItem({ project }: { project: ProjectRowStatic }) {
  const { ref, isInView } = useInViewAnimation(0.2);
  const titleKey = `projects.${project.title}.title`;
  const descKey = `projects.${project.title}.description`;

  return (
    <div ref={ref} className="flex flex-col gap-8">
      <div className={cn("ml-0 sm:ml-12 md:ml-28 transition-all duration-1000",
        isInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10")}>
        <h3 className="text-2xl md:text-3xl font-semibold font-serif text-[#051A24] mb-2">
          <EditableText assetKey={titleKey} defaultValue={project.title} as="span" />
        </h3>
        <p className="text-sm md:text-base text-[#051A24]/70">
          <EditableText assetKey={descKey} defaultValue={project.description} as="span" multiline />
        </p>
      </div>
      <div className={cn("w-full overflow-hidden rounded-2xl shadow-lg transition-all duration-1000 delay-200",
        isInView ? "opacity-100 scale-100" : "opacity-0 scale-95")}>
        <EditableAsset
          assetKey={`projects.${project.title}.image`}
          defaultValue={project.image}
          alt={project.title}
          className="w-full h-[300px] md:h-[600px] object-cover"
        />
      </div>
    </div>
  );
}
